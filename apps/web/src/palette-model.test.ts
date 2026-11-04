import { describe, expect, it } from 'vitest'
import { catalogName } from './api'
import { argumentBreadcrumb, objectTypeFilter, paletteKeyEffect, placeTargetId, tabHint } from './palette-core'
import { argumentCommands } from './palette-operations'
import { objectPaletteRows } from './palette-objects'
import { activeAfterQuery, askIndex, markedTitle, paletteMatchScore, readPaletteMemory, rememberPaletteItem, rememberRecent, selectedObjectId, sublistPlaceholder, visibleRows, withRecent, type PaletteItem } from './palette-model'

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
    expect(ranked.filter((row) => row.group === 'recent').map((row) => row.id)).toEqual(['op:open:product'])
    expect(ranked.some((row) => row.group === 'recent' && row.id === 'layout:reset_layout')).toBe(false)
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
    expect(opened.some((row) => row.group === 'best')).toBe(false)
    expect(opened.find((row) => row.id === 'op:ui.open_view')?.argument).toEqual({ name: 'id', type: 'view' })
    expect(opened.some((row) => row.id === 'view:a' || row.sourceId === 'view:a')).toBe(false)
    expect(activeAfterQuery(opened, 'Open view')).toBe(opened.findIndex((row) => row.id === 'op:ui.open_view'))
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
    const ov = visibleRows('ov', ranked, [], {})
    const openV = visibleRows('open v', ranked, [], {})
    expect(ov[activeAfterQuery(ov, 'ov') ?? -1]?.id).toBe('op:ui.open_view')
    expect(openV[activeAfterQuery(openV, 'open v') ?? -1]?.id).toBe('op:ui.open_view')

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
    expect(picked.some((row) => row.id === 'hit:missing')).toBe(false)
    expect(picked.filter((row) => row.id === 'hit:new')).toHaveLength(1)
    expect(picked[0]?.id).toBe('hit:new')
    expect(selectedObjectId(picked[0]!)).toBe('new')
  })

  it('remembers a palette row in the same store the list reads back', () => {
    const store = memoryStorage()
    rememberPaletteItem(
      { id: 'hit:ched', group: 'search', title: 'ART-1 · Cheddar', subtitle: 'Open product', typeKey: 'product' },
      store,
    )
    expect(readPaletteMemory(store)[0]).toMatchObject({ id: 'hit:ched', title: 'ART-1 · Cheddar', typeKey: 'product' })
  })

  it('ranks prod, new t, and ov, and breaks equal scores with frecency', () => {
    const openProduct: PaletteItem = {
      id: 'op:open:product',
      group: 'views',
      title: 'Open product ›',
      subtitle: 'Products',
      argument: { name: 'id', type: 'product' },
    }
    const products: PaletteItem = { id: 'view:products', group: 'views', title: 'Products', subtitle: 'Open view', entity: true }
    expect(paletteMatchScore(openProduct, 'prod')).toBe(720 + 500)
    expect(paletteMatchScore(products, 'prod')).toBe(800 + Math.round((30 * 4) / 'products'.length))
    const prod = visibleRows('prod', [products, openProduct], [], {})
    expect(prod.find((row) => row.id !== 'ask')?.id).toBe('op:open:product')

    const openView: PaletteItem = {
      id: 'op:ui.open_view',
      group: 'views',
      title: 'Open view ›',
      subtitle: 'Search and open',
      argument: { name: 'id', type: 'view' },
    }
    const overview: PaletteItem = { id: 'view:overview', group: 'views', title: 'Overview', subtitle: 'Open view', entity: true }
    const ov = visibleRows('ov', [overview, products, openView], [], {})
    expect(ov[activeAfterQuery(ov, 'ov') ?? -1]?.id).toBe('op:ui.open_view')
    expect(paletteMatchScore(openView, 'ov') - 500).toBeLessThan(1000)

    const type: PaletteItem = { id: 'model:new-type', group: 'model', title: 'New type', subtitle: 'Data model' }
    const tree: PaletteItem = { id: 'model:new-tree', group: 'model', title: 'New tree', subtitle: 'Data model' }
    const link: PaletteItem = { id: 'model:new-link-type', group: 'model', title: 'New link type', subtitle: 'Data model' }
    const prefix = paletteMatchScore(type, 'new t') - 500
    expect(prefix).toBe(800 + Math.round((30 * 'new t'.length) / 'new type'.length))
    expect(prefix).toBeGreaterThanOrEqual(800)
    expect(prefix).toBeLessThan(1000)
    expect(paletteMatchScore(type, 'new t')).toBe(paletteMatchScore(tree, 'new t'))
    expect(paletteMatchScore(type, 'new t')).toBeGreaterThan(paletteMatchScore(link, 'new t'))
    const now = 1_700_000_000_000
    const tied = visibleRows('new t', [type, tree, link], [], {}, now)
    expect(tied.find((row) => row.group === 'create')?.id).toBe('model:new-tree')
    const used = visibleRows('new t', [tree, link, type], [], {
      'model:new-type': { uses: 2, last: now },
      'model:new-tree': { uses: 9, last: now - 86_400_000 * 40 },
    }, now)
    expect(used.find((row) => row.group === 'create')?.id).toBe('model:new-type')
    const later = visibleRows('new t', [tree, type], [], {
      'model:new-type': { uses: 1, last: now },
      'model:new-tree': { uses: 1, last: now - 1_000 },
    }, now)
    expect(later.find((row) => row.group === 'create')?.id).toBe('model:new-type')
  })

  it('keeps one row per destination and drops deleted views and objects', () => {
    const rows = visibleRows('', [
      { id: 'view:products', group: 'views', title: 'Products', subtitle: 'Open view' },
      { id: 'type-view:product', group: 'views', title: 'Products view', subtitle: 'Open view' },
      { id: 'type-view:article', group: 'views', title: 'Articles view', subtitle: 'Open view' },
    ], [], {})
    expect(rows.filter((row) => row.title === 'Products view')).toHaveLength(0)
    expect(rows.filter((row) => row.title === 'Products')).toHaveLength(1)
    expect(rows.filter((row) => row.title === 'Articles view')).toHaveLength(1)

    const now = 60
    const memory: PaletteItem[] = [
      { id: 'view:gone', group: 'views', title: 'Old view', subtitle: 'Open view' },
      { id: 'hit:gone', group: 'search', title: 'Gone', subtitle: 'Open product' },
      { id: 'hit:open', group: 'search', title: 'Cheddar', subtitle: 'Open product' },
    ]
    const live = visibleRows('', [
      { id: 'view:live', group: 'views', title: 'Live', subtitle: 'Open view' },
    ], [], {
      'view:gone': { uses: 3, last: 50 },
      'hit:gone': { uses: 3, last: 40 },
      'hit:open': { uses: 1, last: 10 },
      'view:live': { uses: 1, last: 5 },
    }, now, memory, 'open')
    expect(live.filter((row) => row.group === 'recent').map((row) => row.id)).toEqual(['hit:open', 'view:live'])
  })

  it('skips layout, theme, and shortcut commands when remembering, and marks dialogs', () => {
    expect(rememberRecent({ id: 'layout:reset_layout', group: 'views', title: 'Reset layout', subtitle: '' })).toBe(false)
    expect(rememberRecent({ id: 'layout:move_view_left', group: 'views', title: 'Move view left', subtitle: '', shortcut: 'Ctrl+Alt+←' })).toBe(false)
    expect(rememberRecent({ id: 'theme:toggle', group: 'views', title: 'Toggle theme', subtitle: '', shortcut: 'Ctrl+Shift+L' })).toBe(false)
    expect(rememberRecent({ id: 'feedback:send', group: 'views', title: 'Send feedback', subtitle: '', shortcut: 'Ctrl+Shift+F' })).toBe(false)
    expect(rememberRecent({ id: 'workspace:1', group: 'views', title: 'Main', subtitle: 'Open workspace', shortcut: 'Ctrl+1' })).toBe(true)
    expect(rememberRecent({ id: 'view:1', group: 'views', title: 'Articles', subtitle: 'Open view' })).toBe(true)
    expect(rememberRecent({ id: 'hit:1', group: 'search', title: 'Cheddar', subtitle: 'Open product' })).toBe(true)
    expect(rememberRecent({ id: 'op:open', group: 'views', title: 'Open view ›', subtitle: '', argument: { name: 'id', type: 'view' } })).toBe(true)
    expect(markedTitle({ id: 'workspace:delete', group: 'views', title: 'Delete workspace', subtitle: '' })).toBe('Delete workspace…')
    expect(markedTitle({ id: 'op:open', group: 'views', title: 'Open view ›', subtitle: '' })).toBe('Open view ›')
    expect(markedTitle({ id: 'import:file', group: 'views', title: 'Import file…', subtitle: '' })).toBe('Import file…')
    expect(sublistPlaceholder({ label: 'Open view ›', paramType: 'view' })).toBe('Search views…')
    expect(sublistPlaceholder({ label: 'Open workspace ›', paramType: 'workspace' })).toBe('Search workspaces…')
    expect(sublistPlaceholder({ label: 'Open product ›', paramType: 'product' }, ['Products'])).toBe('Search products…')
    expect(sublistPlaceholder({ label: 'Open object ›', paramType: 'object' })).toBe('Search objects…')
  })

  it('orders sections recent, navigation, create, data model, links', () => {
    const listed = visibleRows('', [
      { id: 'link:to', group: 'views', title: 'Link to ›', subtitle: 'Add a link' },
      { id: 'model:rename-key', group: 'model', title: 'Rename key…', subtitle: 'Data model' },
      { id: 'model:new-type', group: 'model', title: 'New type', subtitle: 'Data model' },
      { id: 'view:a', group: 'views', title: 'Articles', subtitle: 'Open view' },
      { id: 'workspace:new', group: 'views', title: 'New workspace', subtitle: 'Create' },
    ], [], {})
    const order = [...new Set(listed.filter((row) => row.group !== 'ask').map((row) => row.group))]
    expect(order).toEqual(['navigation', 'create', 'model', 'links'])
    expect(listed.find((row) => row.id === 'model:new-type')?.group).toBe('create')
    expect(listed.find((row) => row.id === 'workspace:new')?.group).toBe('create')
    expect(listed.find((row) => row.id === 'link:to')?.group).toBe('links')
    expect(listed.find((row) => row.id === 'view:a')?.group).toBe('navigation')
    expect(listed.find((row) => row.id === 'model:rename-key')?.group).toBe('model')
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

  it('opens actions on an entity with Ctrl+Enter and ignores Ctrl+K', () => {
    const entity = { ...base, stackDepth: 0, row: { argument: false, entity: true, ask: false, disabled: false } }
    expect(paletteKeyEffect({ ...entity, key: 'Enter', ctrlKey: true })).toEqual({ type: 'actions', index: 0 })
    expect(paletteKeyEffect({ ...entity, key: 'k', ctrlKey: true })).toEqual({ type: 'none' })
    expect(paletteKeyEffect({ ...entity, key: 'k', metaKey: true })).toEqual({ type: 'none' })
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
