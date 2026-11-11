import { describe, expect, it } from 'vitest'
import {
  isSelectSourceRoot,
  parseSelectSourceChoice,
  resolveSourceTarget,
  selectSourceMenuRows,
  selectSourceRootItem,
  selectSourceSubmenuRows,
  targetTypeIdForView,
  SELECT_SOURCE_ROOT_ID,
} from './palette-select-source'
import { copy } from './i18n'
import type { TypeName } from './type-labels'

const types: TypeName[] = [
  { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity' },
  { id: 't-link', key: 'contains', singular: 'Contains', plural: 'Contains', kind: 'link' },
]

describe('palette select source', () => {
  it('builds a Data source root and type rows (no link types)', () => {
    expect(selectSourceRootItem().id).toBe(SELECT_SOURCE_ROOT_ID)
    expect(selectSourceRootItem().title).toContain(copy.dataSource)
    const rows = selectSourceSubmenuRows(types)
    expect(rows.map((row) => row.id)).toEqual(['select-source:type:t-article'])
    expect(rows[0].title).toBe(copy.allOfType.replace('{type}', 'Articles'))
  })

  it('parses type choices and recognizes the root', () => {
    expect(isSelectSourceRoot(SELECT_SOURCE_ROOT_ID)).toBe(true)
    expect(parseSelectSourceChoice('select-source:type:t-article')).toEqual({ typeId: 't-article' })
    expect(parseSelectSourceChoice(SELECT_SOURCE_ROOT_ID)).toBeNull()
  })
})

describe('palette peer sources (Notion 103 PR 2)', () => {
  it('puts live peer sources under their matching all-of-type row', () => {
    const rows = selectSourceSubmenuRows(types, [
      {
        viewId: 'view-food',
        viewTitle: 'Food',
        selection: 'node',
        label: 'Cheese',
        typeIds: ['t-article'],
      },
      {
        viewId: 'view-suppliers',
        viewTitle: 'Suppliers',
        selection: 'row',
        label: 'SUP-1',
        typeIds: ['t-article'],
      },
      {
        viewId: 'view-unrelated',
        viewTitle: 'Unrelated',
        selection: 'row',
        label: 'X',
        typeIds: ['t-other'],
      },
    ])
    expect(rows.map((row) => row.id)).toEqual([
      'select-source:type:t-article',
      'select-source:peer:t-article:view-food:node',
      'select-source:peer:t-article:view-suppliers:row',
    ])
    expect(rows[1].title).toBe(copy.fromSourceLabel.replace('{type}', 'Articles').replace('{source}', 'Food'))
    expect(rows[1].subtitle).toBe('Cheese')
  })

  it('marks the current all-of-type row, including when no source is stored', () => {
    const rows = selectSourceSubmenuRows(types, [], { typeId: 't-article' })
    expect(rows[0].chips).toEqual([{ text: copy.current, tone: 'ok' }])
    expect(rows.filter((row) => row.chips?.some((chip) => chip.text === copy.current))).toHaveLength(1)
  })

  it('marks the current peer source instead of all-of-type', () => {
    const peerOptions = [
      { viewId: 'view-food', viewTitle: 'Food', selection: 'node' as const, label: 'Cheese', typeIds: ['t-article'] },
    ]
    const rows = selectSourceSubmenuRows(types, peerOptions, {
      typeId: 't-article',
      peerViewId: 'view-food',
      selection: 'node',
    })
    expect(rows[0].chips).toBeUndefined()
    expect(rows[1].chips).toEqual([{ text: copy.current, tone: 'ok' }])
  })

  it('does not mark a peer source with a different selection', () => {
    const peerOptions = [
      { viewId: 'view-food', viewTitle: 'Food', selection: 'node' as const, label: 'Cheese', typeIds: ['t-article'] },
    ]
    const rows = selectSourceSubmenuRows(types, peerOptions, {
      typeId: 't-article',
      peerViewId: 'view-food',
      selection: 'row',
    })
    expect(rows.some((row) => row.chips?.some((chip) => chip.text === copy.current))).toBe(false)
  })

  it('shows one row per link type when several connect the source and target', () => {
    const rows = selectSourceSubmenuRows(types, [
      {
        viewId: 'view-products',
        viewTitle: 'Products',
        selection: 'row',
        label: 'PROD-1',
        typeIds: ['t-article'],
        links: [
          { typeId: 't-article', linkType: 'contains' },
          { typeId: 't-article', linkType: 'related' },
        ],
      },
    ], {
      typeId: 't-article',
      peerViewId: 'view-products',
      selection: 'row',
      linkType: 'related',
    })
    const peerRows = rows.filter((row) => row.id.includes(':peer:'))
    expect(peerRows.map((row) => row.id)).toEqual([
      'select-source:peer:t-article:view-products:row:contains',
      'select-source:peer:t-article:view-products:row:related',
    ])
    expect(peerRows[0].title).toBe('Articles from Products via contains')
    expect(peerRows[1].title).toBe('Articles from Products via related')
    expect(peerRows[0].chips).toBeUndefined()
    expect(peerRows[1].chips).toEqual([{ text: copy.current, tone: 'ok' }])
  })

  it('disables self and indirect cycle sources with an explanation', () => {
    const peerOptions = [
      { viewId: 'view-a', viewTitle: 'A', selection: 'row' as const, label: '', typeIds: ['t-article'] },
      { viewId: 'view-b', viewTitle: 'B', selection: 'row' as const, label: '', typeIds: ['t-article'] },
      { viewId: 'view-c', viewTitle: 'C', selection: 'row' as const, label: '', typeIds: ['t-article'] },
      { viewId: 'view-free', viewTitle: 'Free', selection: 'row' as const, label: 'ART-1', typeIds: ['t-article'] },
    ]
    const sources = new Map<string, string>([
      ['view-b', 'view-a'],
      ['view-c', 'view-b'],
    ])
    const rows = selectSourceSubmenuRows(types, peerOptions, null, {
      targetViewId: 'view-a',
      sourceOf: (viewId) => sources.get(viewId),
    })
    const byView = (viewId: string) => rows.find((row) => row.id === `select-source:peer:t-article:${viewId}:row`)
    expect(byView('view-a')?.disabled).toBe(true)
    expect(byView('view-b')?.disabled).toBe(true)
    expect(byView('view-c')?.disabled).toBe(true)
    expect(byView('view-c')?.subtitle).toBe('Would create a cycle (Articles follows C)')
    expect(byView('view-free')?.disabled).toBeUndefined()
    expect(byView('view-free')?.subtitle).toBe('ART-1')
  })

  it('resolves the explicit menu target over focus, and focus for Ctrl+K', () => {
    const tables = [
      { id: 'view-products', type: 'object_table' },
      { id: 'view-articles', type: 'object_table' },
      { id: 'view-detail', type: 'object_detail' },
    ]
    expect(resolveSourceTarget(tables, 'view-articles', 'view-products')?.id).toBe('view-articles')
    expect(resolveSourceTarget(tables, undefined, 'view-articles')?.id).toBe('view-articles')
    expect(resolveSourceTarget(tables, 'view-detail', 'view-articles')?.id).toBe('view-articles')
    expect(resolveSourceTarget(tables, null, 'view-detail')?.id).toBe('view-products')
  })

  it('does not disable a valid peer of the menu target just because another pane holds focus', () => {
    const tables = [
      { id: 'view-products', type: 'object_table' },
      { id: 'view-articles', type: 'object_table' },
    ]
    const productAndArticleTypes: TypeName[] = [
      { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity' },
      { id: 't-product', key: 'product', singular: 'Product', plural: 'Products', kind: 'entity' },
    ]
    const peerOptions = [{
      viewId: 'view-products',
      viewTitle: 'Products',
      selection: 'row' as const,
      label: 'PROD-1',
      typeIds: ['t-article'],
      links: [{ typeId: 't-article', linkType: 'product_articles' }],
    }]
    // The repro: Products holds focus while the Articles menu opens.
    const target = resolveSourceTarget(tables, 'view-articles', 'view-products')
    const rows = selectSourceSubmenuRows(
      productAndArticleTypes,
      peerOptions,
      { typeId: 't-article' },
      { targetViewId: target?.id ?? '', sourceOf: () => undefined },
    )
    const all = rows.find((row) => row.id === 'select-source:type:t-article')
    const peer = rows.find((row) => row.id === 'select-source:peer:t-article:view-products:row')
    expect(all?.chips).toEqual([{ text: copy.current, tone: 'ok' }])
    expect(peer?.disabled).toBeUndefined()
    expect(peer?.subtitle).toBe('PROD-1')
  })

  it('still disables a genuine A -> B -> C -> A source cycle', () => {
    const tables = [
      { id: 'view-a', type: 'object_table' },
      { id: 'view-b', type: 'object_table' },
      { id: 'view-c', type: 'object_table' },
    ]
    const sources = new Map<string, string>([
      ['view-b', 'view-a'],
      ['view-c', 'view-b'],
    ])
    const target = resolveSourceTarget(tables, 'view-a', 'view-b')
    const rows = selectSourceSubmenuRows(types, [{
      viewId: 'view-c',
      viewTitle: 'C',
      selection: 'row',
      label: 'ART-1',
      typeIds: ['t-article'],
    }], null, {
      targetViewId: target?.id ?? '',
      sourceOf: (viewId) => sources.get(viewId),
    })
    const cycle = rows.find((row) => row.id === 'select-source:peer:t-article:view-c:row')
    expect(cycle?.disabled).toBe(true)
    expect(cycle?.subtitle).toBe('Would create a cycle (Articles follows C)')
  })

  it('names the follow direction in the cycle explanation', () => {
    const rows = selectSourceSubmenuRows(types, [
      {
        viewId: 'view-products',
        viewTitle: 'Products',
        selection: 'row',
        label: 'PROD-1',
        typeIds: ['t-article'],
      },
    ], null, {
      targetViewId: 'view-articles',
      sourceOf: (viewId) => (viewId === 'view-products' ? 'view-articles' : undefined),
    })
    const cycle = rows.find((row) => row.id === 'select-source:peer:t-article:view-products:row')
    expect(cycle?.disabled).toBe(true)
    expect(cycle?.subtitle).toBe('Would create a cycle (Articles follows Products)')
  })

  it('offers only the target view type in the submenu', () => {
    const scoped: TypeName[] = [
      { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity' },
      { id: 't-product', key: 'product', singular: 'Product', plural: 'Products', kind: 'entity' },
      { id: 't-supplier', key: 'supplier', singular: 'Supplier', plural: 'Suppliers', kind: 'entity' },
    ]
    const peerOptions = [
      { viewId: 'view-products', viewTitle: 'Products', selection: 'row' as const, label: 'PROD-1', typeIds: ['t-article'] },
      { viewId: 'view-articles', viewTitle: 'Articles', selection: 'row' as const, label: 'ART-1', typeIds: ['t-product', 't-supplier'] },
    ]
    const rows = selectSourceSubmenuRows(scoped, peerOptions, { typeId: 't-product' }, undefined, 't-product')
    expect(rows.map((row) => row.id)).toEqual([
      'select-source:type:t-product',
      'select-source:peer:t-product:view-articles:row',
    ])
  })

  it('keeps every type for a generic target view', () => {
    const scoped: TypeName[] = [
      { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity' },
      { id: 't-product', key: 'product', singular: 'Product', plural: 'Products', kind: 'entity' },
    ]
    const rows = selectSourceSubmenuRows(scoped, [], undefined, undefined, '')
    expect(rows.map((row) => row.id)).toEqual(['select-source:type:t-article', 'select-source:type:t-product'])
  })

  it('parses peer choices with an optional link type and still ignores the link type as a source', () => {
    expect(parseSelectSourceChoice('select-source:peer:t-article:view-food:node')).toEqual({
      peerViewId: 'view-food',
      selection: 'node',
    })
    expect(parseSelectSourceChoice('select-source:peer:t-article:view-food:row:contains')).toEqual({
      peerViewId: 'view-food',
      selection: 'row',
      linkType: 'contains',
    })
    const rows = selectSourceSubmenuRows(types, [
      { viewId: 'v', viewTitle: 'Food', selection: 'node', label: 'Cheese', typeIds: ['t-link'] },
    ])
    expect(rows.some((row) => row.id.includes(':peer:'))).toBe(false)
  })
})

describe('Select source lists every source that can yield the view type (row 103 follow-up)', () => {
  const demoTypes: TypeName[] = [
    { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity', structures: ['s-food'] },
    { id: 't-product', key: 'product', singular: 'Product', plural: 'Products', kind: 'entity', structures: ['s-food'] },
    { id: 't-supplier', key: 'supplier', singular: 'Supplier', plural: 'Suppliers', kind: 'entity', structures: [] },
    {
      id: 't-link',
      key: 'product_articles',
      singular: 'Product–Article',
      plural: 'Product–Article',
      kind: 'link',
      linkFrom: { id: 't-product', key: 'product' },
    },
  ]

  const peerOptions = [
    {
      viewId: 'view-products',
      viewTitle: 'Products',
      selection: 'row' as const,
      label: '',
      typeIds: ['t-article'],
      links: [{ typeId: 't-article', linkType: 'product_articles' }],
    },
    {
      viewId: 'view-suppliers',
      viewTitle: 'Suppliers',
      selection: 'row' as const,
      label: '',
      typeIds: ['t-article'],
    },
    {
      viewId: 'view-other-products',
      viewTitle: 'Other products',
      selection: 'row' as const,
      label: '',
      typeIds: ['t-product'],
    },
    {
      viewId: 'view-food',
      viewTitle: 'Food',
      selection: 'node' as const,
      label: 'Cheese',
      typeIds: ['t-article', 't-product'],
    },
  ]

  it('takes the bound type from the target view, not the current source', () => {
    expect(targetTypeIdForView({ state: { object_type: 't-article' } }, demoTypes)).toBe('t-article')
    expect(targetTypeIdForView({ state: {} }, demoTypes)).toBe('')
    // Link-bound tables list their source entity.
    expect(targetTypeIdForView({ state: { object_type: 't-link' } }, demoTypes)).toBe('t-product')
  })

  it('offers Article sources on an Articles view that already follows Products', () => {
    const rows = selectSourceMenuRows({
      types: demoTypes,
      peerOptions,
      // The stale source type must not narrow the menu.
      current: { typeId: 't-product' },
      targetView: { state: { object_type: 't-article', type_key: 'article' } },
    })
    expect(rows.map((row) => row.id)).toEqual([
      'select-source:type:t-article',
      'select-source:peer:t-article:view-products:row',
      'select-source:peer:t-article:view-suppliers:row',
      'select-source:peer:t-article:view-food:node',
    ])
    expect(rows.map((row) => row.title)).toEqual([
      'All Articles',
      'Articles from Products',
      'Articles from Suppliers',
      'Articles from Food',
    ])
  })

  it('offers Product sources on a Products view and omits underivable ones', () => {
    const rows = selectSourceMenuRows({
      types: demoTypes,
      peerOptions,
      current: { typeId: 't-article' },
      targetView: { state: { object_type: 't-product', type_key: 'product' } },
    })
    expect(rows.map((row) => row.id)).toEqual([
      'select-source:type:t-product',
      'select-source:peer:t-product:view-other-products:row',
      'select-source:peer:t-product:view-food:node',
    ])
    expect(rows.map((row) => row.title)).toEqual([
      'All Products',
      'Products from Other products',
      'Products from Food',
    ])
  })

  it('omits a tree and a type with no derivation path to the target', () => {
    const rows = selectSourceMenuRows({
      types: demoTypes,
      peerOptions: [
        { viewId: 'view-suppliers', viewTitle: 'Suppliers', selection: 'row', label: '', typeIds: ['t-article'] },
        { viewId: 'view-food', viewTitle: 'Food', selection: 'node', label: 'Cheese', typeIds: ['t-article'] },
      ],
      targetView: { state: { object_type: 't-product' } },
    })
    expect(rows.map((row) => row.id)).toEqual(['select-source:type:t-product'])
  })

  it('keeps every type for a generic view', () => {
    const rows = selectSourceMenuRows({
      types: demoTypes,
      peerOptions: [],
      targetView: { state: {} },
    })
    expect(rows.map((row) => row.id)).toEqual([
      'select-source:type:t-article',
      'select-source:type:t-product',
      'select-source:type:t-supplier',
    ])
  })

  it('still disables a cycle with the follows label', () => {
    const rows = selectSourceMenuRows({
      types: demoTypes,
      peerOptions: [{
        viewId: 'view-children',
        viewTitle: 'Articles',
        selection: 'row',
        label: '',
        typeIds: ['t-article'],
      }],
      cycleCheck: { targetViewId: 'view-articles', sourceOf: () => 'view-articles' },
      targetView: { state: { object_type: 't-article' } },
    })
    const cycle = rows.find((row) => row.id === 'select-source:peer:t-article:view-children:row')
    expect(cycle?.disabled).toBe(true)
    expect(cycle?.subtitle).toBe('Would create a cycle (Articles follows Articles)')
  })
})
