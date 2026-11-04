import { describe, expect, it } from 'vitest'
import { catalogName } from './api'
import { argumentBreadcrumb, objectTypeFilter, paletteKeyEffect, placeTargetId } from './palette-core'
import { argumentCommands } from './palette-operations'
import { objectPaletteRows } from './palette-objects'
import { askIndex, visibleRows, withRecent, type PaletteItem } from './palette-model'

const catalog: PaletteItem[] = [
  { id: 'view:detail', group: 'views', title: 'Detail', subtitle: 'Open the detail view' },
  { id: 'object:history', group: 'object', title: 'History', subtitle: 'On the selected object' },
]

describe('palette rows', () => {
  it('keeps Ask AI last and inside the same list', () => {
    const rows = visibleRows('hej', catalog, [], {})
    expect(rows.at(-1)?.id).toBe('ask')
    expect(rows.at(-1)?.title).toContain('Ask AI')
    expect(rows.at(-1)?.subtitle).toBe('')
    expect(rows.every((row) => row.group !== 'ask' || row.id === 'ask')).toBe(true)
    expect(askIndex(rows)).toBe(rows.length - 1)
  })

  it('puts search hits above the ask row with a middle dot', () => {
    const rows = visibleRows('ched', [], [{ id: '1', group: 'search', title: 'ART-CHED-200 · Mature cheddar', subtitle: 'article' }], {})
    const hit = rows.find((row) => row.group === 'search')
    expect(hit?.title).toContain('·')
    expect(rows.at(-1)?.group).toBe('ask')
  })

  it('keeps recent rows at the top of a sub-list until the query is non-empty', () => {
    const rows: PaletteItem[] = [
      { id: 'view:a', group: 'views', title: 'Articles', subtitle: 'Open view' },
      { id: 'view:b', group: 'views', title: 'Products', subtitle: 'Open view' },
    ]
    const now = 1_700_000_000_000
    const ranked = withRecent(rows, { 'view:b': { uses: 2, last: now } }, now, '')
    expect(ranked[0]?.id).toBe('view:b')
    expect(ranked[0]?.group).toBe('recent')
    expect(ranked.map((row) => row.id)).toEqual(['view:b', 'view:a'])
    expect(withRecent(rows, { 'view:b': { uses: 2, last: now } }, now, 'art').map((row) => row.id)).toEqual(['view:a', 'view:b'])
  })
})

describe('palette key effect', () => {
  const base = {
    ctrlKey: false,
    metaKey: false,
    query: '',
    inQueryField: true,
    mode: 'list' as const,
    stackDepth: 1,
    escapeCloses: false,
    activeIndex: 0,
    rowCount: 3,
    row: { argument: true, entity: false, ask: false, disabled: false },
  }

  it('enters a sub-list with Tab or Enter and leaves it with Backspace or Esc', () => {
    expect(paletteKeyEffect({ ...base, key: 'Tab' })).toEqual({ type: 'activate', index: 0 })
    expect(paletteKeyEffect({ ...base, key: 'Enter' })).toEqual({ type: 'activate', index: 0 })
    expect(paletteKeyEffect({ ...base, key: 'Backspace' })).toEqual({ type: 'back' })
    expect(paletteKeyEffect({ ...base, key: 'Escape' })).toEqual({ type: 'back' })
    expect(paletteKeyEffect({ ...base, key: 'Escape', stackDepth: 0 })).toEqual({ type: 'close' })
  })

  it('opens actions on an entity with Ctrl+Enter and Ctrl+K, and asks with Ctrl+J', () => {
    const entity = { ...base, stackDepth: 0, row: { argument: false, entity: true, ask: false, disabled: false } }
    expect(paletteKeyEffect({ ...entity, key: 'Enter', ctrlKey: true })).toEqual({ type: 'actions', index: 0 })
    expect(paletteKeyEffect({ ...entity, key: 'k', ctrlKey: true })).toEqual({ type: 'actions', index: 0 })
    expect(paletteKeyEffect({ ...entity, key: 'j', ctrlKey: true })).toEqual({ type: 'ask' })
  })

  it('leaves Home and End to the query caret', () => {
    expect(paletteKeyEffect({ ...base, key: 'Home' })).toEqual({ type: 'caret' })
    expect(paletteKeyEffect({ ...base, key: 'End', inQueryField: true })).toEqual({ type: 'caret' })
    expect(paletteKeyEffect({ ...base, key: 'Home', inQueryField: false })).toEqual({ type: 'move', index: 0 })
  })
})

describe('palette providers', () => {
  it('builds sub-lists from operation params and strips the workspace prefix', () => {
    const commands = argumentCommands(
      [{ name: 'ui.open_view', title: 'Open view', params: [{ name: 'id', type: 'view' }] }],
      [{ id: 't1', key: 'product', singular: 'Product', plural: 'Products' }],
    )
    expect(commands.find((row) => row.id === 'op:ui.open_view')?.argument).toEqual({ name: 'id', type: 'view' })
    expect(commands.find((row) => row.id === 'op:open:product')?.title).toBe('Open product')
    expect(argumentBreadcrumb('Open view')).toBe('Open view ›')
    expect(placeTargetId('workspace:ws-1')).toBe('ws-1')
    expect(placeTargetId('view:view-1')).toBe('view-1')
    expect(objectTypeFilter('product')).toBe('type_key:=product')
    expect(objectTypeFilter('object')).toBeUndefined()
  })

  it('titles a search hit with the display name', () => {
    const doc = { id: '1', key: 'ART-1', type_key: 'article', display_name: 'Cheddar', a_namn__sv: 'Ost' }
    expect(catalogName(doc)).toBe('Cheddar')
    expect(catalogName({ a_namn__sv: 'Ost' })).toBe('Ost')
    expect(objectPaletteRows([{ document: doc }], undefined)[0]?.title).toBe('ART-1 · Cheddar')
  })
})
