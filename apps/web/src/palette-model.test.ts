import { describe, expect, it } from 'vitest'
import { catalogName } from './api'
import { argumentBreadcrumb, objectTypeFilter, paletteKeyEffect, placeTargetId, tabHint } from './palette-core'
import { argumentCommands } from './palette-operations'
import { objectPaletteRows } from './palette-objects'
import { activeAfterQuery, askIndex, readPaletteMemory, rememberPaletteItem, selectedObjectId, visibleRows, withRecent, type PaletteItem } from './palette-model'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
    clear: () => data.clear(),
    key: () => null,
    length: 0,
  } as Storage
}

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

  it('puts the last run first, even when an older command has more uses', () => {
    const rows: PaletteItem[] = [
      { id: 'op:open:product', group: 'views', title: 'Open product ›', subtitle: 'Products', argument: { name: 'id', type: 'product' } },
      { id: 'layout:reset_layout', group: 'views', title: 'Reset layout', subtitle: 'Restore the saved workspace layout' },
      { id: 'op:open:product', group: 'views', title: 'Open product ›', subtitle: 'Products', argument: { name: 'id', type: 'product' } },
    ]
    const now = 5_000
    const frecency = {
      'layout:reset_layout': { uses: 8, last: now - 1_000 },
      'op:open:product': { uses: 1, last: now },
    }
    const ranked = visibleRows('', rows, [], frecency, now)
    expect(ranked.filter((row) => row.group === 'recent').map((row) => row.id)).toEqual(['op:open:product', 'layout:reset_layout'])
  })

  it('puts a picked product first and does not list every view as the Open view match', () => {
    const command: PaletteItem = {
      id: 'op:ui.open_view',
      group: 'views',
      title: 'Open view ›',
      subtitle: 'Search and open',
      keywords: ['open', 'view'],
      argument: { name: 'id', type: 'view' },
    }
    const views: PaletteItem[] = [
      { id: 'view:a', group: 'views', title: 'Articles', subtitle: 'Open view' },
      { id: 'view:b', group: 'views', title: 'Products', subtitle: 'Open view' },
    ]
    const opened = visibleRows('Open view', [command, ...views], [], { 'view:a': { uses: 9, last: 50 } }, 60)
    const best = opened.find((row) => row.group === 'best')
    expect(best?.sourceId).toBe('op:ui.open_view')
    expect(best?.argument).toEqual({ name: 'id', type: 'view' })
    expect(opened.some((row) => row.id === 'view:a' || row.sourceId === 'view:a')).toBe(false)
    expect(activeAfterQuery(opened, 'Open view')).toBe(opened.findIndex((row) => row.group === 'best'))
    expect(visibleRows('Articles', [command, ...views], [], {}).some((row) => row.title === 'Articles')).toBe(true)

    const overview: PaletteItem = { id: 'view:overview', group: 'views', title: 'Overview', subtitle: 'Open view', entity: true }
    const vintage: PaletteItem = { id: 'view:vintage', group: 'views', title: 'Open vintage', subtitle: 'Open view', entity: true }
    const product: PaletteItem = {
      id: 'op:open:product',
      group: 'views',
      title: 'Open product ›',
      subtitle: 'Products',
      argument: { name: 'id', type: 'product' },
    }
    const ranked = [command, product, overview, vintage, ...views]
    expect(visibleRows('ov', ranked, [], {}).find((row) => row.group === 'best')?.sourceId).toBe('op:ui.open_view')
    expect(visibleRows('open v', ranked, [], {}).find((row) => row.group === 'best')?.sourceId).toBe('op:ui.open_view')

    const hits: PaletteItem[] = [
      { id: 'hit:old', group: 'search', title: 'Old', subtitle: 'Open product', typeKey: 'product' },
      { id: 'hit:new', group: 'search', title: 'Cheddar', subtitle: 'Open product', typeKey: 'product' },
    ]
    const picked = withRecent(hits, {
      'hit:old': { uses: 4, last: 10 },
      'hit:new': { uses: 1, last: 30 },
      'hit:missing': { uses: 1, last: 40 },
    }, 40, '', [
      { id: 'hit:missing', group: 'search', title: 'Brie', subtitle: 'Open product', typeKey: 'product' },
    ])
    expect(picked[0]?.id).toBe('hit:missing')
    expect(picked.filter((row) => row.id === 'hit:new')).toHaveLength(1)
    expect(picked[1]?.id).toBe('hit:new')
    expect(selectedObjectId(picked[0]!)).toBe('missing')
  })

  it('remembers a palette row in the same store the list reads back', () => {
    const store = memoryStorage()
    rememberPaletteItem(
      { id: 'hit:ched', group: 'search', title: 'ART-1 · Cheddar', subtitle: 'Open product', typeKey: 'product' },
      store,
    )
    expect(readPaletteMemory(store)[0]).toMatchObject({ id: 'hit:ched', title: 'ART-1 · Cheddar', typeKey: 'product' })
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

  it('drills in with Tab or Enter and never asks AI as a fallback', () => {
    expect(tabHint({ activeIndex: 0, argument: true })).toBe('open')
    expect(paletteKeyEffect({ ...base, key: 'Tab' })).toEqual({ type: 'activate', index: 0 })
    expect(paletteKeyEffect({ ...base, key: 'Enter' })).toEqual({ type: 'activate', index: 0 })
    expect(paletteKeyEffect({ ...base, key: 'Tab', activeIndex: null, row: undefined })).toEqual({ type: 'none' })
    expect(paletteKeyEffect({ ...base, key: 'Enter', activeIndex: null, row: undefined })).toEqual({ type: 'none' })
    expect(paletteKeyEffect({
      ...base,
      key: 'Tab',
      activeIndex: 2,
      row: { argument: false, entity: false, ask: true, disabled: false },
    })).toEqual({ type: 'none' })
    expect(paletteKeyEffect({
      ...base,
      key: 'Enter',
      activeIndex: 2,
      row: { argument: false, entity: false, ask: true, disabled: false },
    })).toEqual({ type: 'activate', index: 2 })
    expect(paletteKeyEffect({
      ...base,
      key: 'Tab',
      activeIndex: 1,
      row: { argument: false, entity: false, ask: false, disabled: false },
    })).toEqual({ type: 'none' })
    expect(tabHint({ activeIndex: null })).toBe('none')
    expect(tabHint({ activeIndex: 1, ask: true })).toBe('none')
    expect(paletteKeyEffect({ ...base, key: 'j', ctrlKey: true, activeIndex: null, row: undefined })).toEqual({ type: 'ask' })
  })

  it('goes back one level with Backspace and closes with Esc', () => {
    expect(paletteKeyEffect({ ...base, key: 'Backspace' })).toEqual({ type: 'back' })
    expect(paletteKeyEffect({ ...base, key: 'Backspace', query: 'x' })).toEqual({ type: 'none' })
    expect(paletteKeyEffect({ ...base, key: 'Escape' })).toEqual({ type: 'close' })
    expect(paletteKeyEffect({ ...base, key: 'Escape', stackDepth: 0 })).toEqual({ type: 'close' })
    expect(paletteKeyEffect({ ...base, key: 'Escape', mode: 'ai' })).toEqual({ type: 'close' })
  })

  it('moves the highlight with arrows and keeps Home and End in the query', () => {
    expect(paletteKeyEffect({ ...base, key: 'ArrowDown', activeIndex: null, row: undefined })).toEqual({ type: 'move', index: 0 })
    expect(paletteKeyEffect({ ...base, key: 'ArrowDown', activeIndex: 0 })).toEqual({ type: 'move', index: 1 })
    expect(paletteKeyEffect({ ...base, key: 'ArrowUp', activeIndex: 0 })).toEqual({ type: 'move', index: 0 })
    expect(paletteKeyEffect({ ...base, key: 'ArrowUp', activeIndex: null, row: undefined })).toEqual({ type: 'move', index: 2 })
    expect(paletteKeyEffect({ ...base, key: 'Home' })).toEqual({ type: 'caret' })
    expect(paletteKeyEffect({ ...base, key: 'End', inQueryField: true })).toEqual({ type: 'caret' })
    expect(paletteKeyEffect({ ...base, key: 'End', inQueryField: false })).toEqual({ type: 'move', index: 2 })
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
    expect(commands.find((row) => row.id === 'op:open:product')?.title).toBe('Open product ›')
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
