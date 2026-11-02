import { describe, expect, it } from 'vitest'
import {
  applyPeerSource,
  applyTypeSource,
  defaultPeerLinkType,
  isExplicitAllSource,
  isObjectTableView,
  linkedTypeIds,
  linkedTypeLinks,
  peerEmptyState,
  peerIdsFilter,
  peerNodeFilter,
  peerSourceLabel,
  peerSourceOf,
  viewSourceLabel,
  wouldCreateCycle,
} from './view-source'
import { copy } from './i18n'
import type { TypeName } from './type-labels'

const types: TypeName[] = [
  { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity' },
  { id: 't-product', key: 'product', singular: 'Product', plural: 'Products', kind: 'entity' },
]

describe('view source (Notion 103 PR 1)', () => {
  it('applies all-of-type onto view state without dropping other keys', () => {
    const next = applyTypeSource({ table: { filter: 'x' }, object_type: 'old' }, types[1])
    expect(next.object_type).toBe('t-product')
    expect(next.type_key).toBe('product')
    expect(next.table).toEqual({ filter: 'x' })
    expect(next.source).toEqual({ kind: 'all' })
  })

  it('labels the header for a bound object_table', () => {
    expect(
      viewSourceLabel(
        { type: 'object_table', state: { object_type: 't-article', type_key: 'article' } },
        types,
      ),
    ).toBe(copy.allOfType.replace('{type}', 'Articles'))
  })

  it('returns empty for unbound or non-table views', () => {
    expect(viewSourceLabel({ type: 'object_table', state: {} }, types)).toBe('')
    expect(viewSourceLabel({ type: 'object_detail', state: { object_type: 't-article' } }, types)).toBe('')
  })

  it('detects object_table', () => {
    expect(isObjectTableView({ type: 'object_table' })).toBe(true)
    expect(isObjectTableView({ type: 'graph' })).toBe(false)
  })
})

describe('peer source (Notion 103 PR 2)', () => {
  it('stores an explicit peer source and reads it back', () => {
    const next = applyPeerSource({ type_key: 'product', object_type: 't-product' }, 'view-articles', 'row')
    expect(next.source).toEqual({ kind: 'peer', viewId: 'view-articles', selection: 'row' })
    expect(peerSourceOf(next)).toEqual({ kind: 'peer', viewId: 'view-articles', selection: 'row' })
  })

  it('stores an optional link type and reads old sources without one', () => {
    const next = applyPeerSource({}, 'view-articles', 'row', 'product_articles')
    expect(next.source).toEqual({
      kind: 'peer',
      viewId: 'view-articles',
      selection: 'row',
      linkType: 'product_articles',
    })
    expect(peerSourceOf(next)).toEqual({
      kind: 'peer',
      viewId: 'view-articles',
      selection: 'row',
      linkType: 'product_articles',
    })
    expect(peerSourceOf({ source: { kind: 'peer', viewId: 'old', selection: 'row' } })).toEqual({
      kind: 'peer',
      viewId: 'old',
      selection: 'row',
    })
  })

  it('picks the first link type when several connect the source and target types', () => {
    const defs = {
      types: [
        { id: 't-product', kind: 'entity' },
        { id: 't-article', kind: 'entity' },
        {
          id: 't-link-contains',
          key: 'contains',
          kind: 'link',
          link: { from_types: ['t-product'], to_types: ['t-article'] },
        },
        {
          id: 't-link-related',
          key: 'related',
          kind: 'link',
          link: { from_types: ['t-product'], to_types: ['t-article'] },
        },
      ],
    }
    expect(defaultPeerLinkType('t-product', 't-article', defs)).toBe('contains')
    expect(defaultPeerLinkType('t-article', 't-product', defs)).toBe('contains')
    expect(defaultPeerLinkType('t-product', 't-other', defs)).toBeUndefined()
    expect(linkedTypeLinks('t-product', defs)).toEqual([
      { linkType: 'contains', typeId: 't-article' },
      { linkType: 'related', typeId: 't-article' },
    ])
  })

  it('ignores malformed or non-peer sources', () => {
    expect(peerSourceOf(undefined)).toBeNull()
    expect(peerSourceOf({ source: { kind: 'all' } })).toBeNull()
    expect(peerSourceOf({ source: { kind: 'peer', viewId: '' } })).toBeNull()
  })

  it('switching back to all-of-type clears the peer source', () => {
    const next = applyTypeSource(
      { object_type: 'old', type_key: 'article', source: { kind: 'peer', viewId: 'v' } },
      types[1],
    )
    expect(next.source).toEqual({ kind: 'all' })
    expect(peerSourceOf(next)).toBeNull()
    expect(isExplicitAllSource(next)).toBe(true)
    expect(next.object_type).toBe('t-product')
  })

  it('only treats a stored all marker as an explicit all source', () => {
    expect(isExplicitAllSource({ source: { kind: 'all' } })).toBe(true)
    expect(isExplicitAllSource({ source: { kind: 'peer', viewId: 'v' } })).toBe(false)
    expect(isExplicitAllSource({})).toBe(false)
    expect(isExplicitAllSource(undefined)).toBe(false)
  })

  it('builds node and linked-id filters', () => {
    expect(peerNodeFilter({ structureKey: 'food', groupKey: 'cheese' })).toBe('groups:=food:cheese')
    expect(peerIdsFilter([])).toBe('id:=__no_peer__')
    expect(peerIdsFilter(['a', 'b'])).toBe('id:=[`a`,`b`]')
  })

  it('lists both link directions but never a link type as a source', () => {
    const defs = {
      types: [
        { id: 't-product', kind: 'entity' },
        { id: 't-article', kind: 'entity' },
        {
          id: 't-link',
          kind: 'link',
          link: { from_types: ['t-product'], to_types: ['t-article'] },
        },
      ],
    }
    expect(linkedTypeIds('t-product', defs)).toEqual(['t-article'])
    expect(linkedTypeIds('t-article', defs)).toEqual(['t-product'])
    expect(linkedTypeIds('t-link', defs)).toEqual([])
    expect(linkedTypeIds('', defs)).toEqual([])
  })

  it('appends the peer label to the header and keeps the catalog suffix', () => {
    expect(peerSourceLabel('Food', 'Cheese')).toBe('Food › Cheese')
    expect(peerSourceLabel('Food', '')).toBe('Food')
    expect(viewSourceLabel(
      { type: 'object_table', state: { object_type: 't-product', type_key: 'product' } },
      types,
      null,
      {},
      'Food › Cheese',
    )).toBe(`${copy.allOfType.replace('{type}', 'Products')} · Food › Cheese`)
  })
})

describe('peer source chains (Notion 103 PR A)', () => {
  const sources = new Map<string, string>([
    ['view-b', 'view-a'],
    ['view-c', 'view-b'],
  ])
  const sourceOf = (viewId: string) => sources.get(viewId)

  it('rejects a self-source', () => {
    expect(wouldCreateCycle('view-a', 'view-a', sourceOf)).toBe(true)
  })

  it('rejects an indirect cycle through the chain', () => {
    expect(wouldCreateCycle('view-c', 'view-a', sourceOf)).toBe(true)
    expect(wouldCreateCycle('view-b', 'view-a', sourceOf)).toBe(true)
  })

  it('allows a chain that does not lead back to the target', () => {
    expect(wouldCreateCycle('view-b', 'view-c', sourceOf)).toBe(false)
    expect(wouldCreateCycle('view-a', 'view-c', sourceOf)).toBe(false)
  })

  it('terminates on an existing cycle that does not contain the target', () => {
    const loop = new Map<string, string>([
      ['view-b', 'view-c'],
      ['view-c', 'view-b'],
    ])
    expect(wouldCreateCycle('view-b', 'view-a', (viewId) => loop.get(viewId))).toBe(false)
  })
})

describe('peer source empty states (Notion 103 decision 6)', () => {
  const source = { kind: 'peer' as const, viewId: 'view-products', selection: 'row' as const }
  const sourceView = { title: 'Products' }
  const articles = types[0]

  it('does nothing without a peer source', () => {
    expect(peerEmptyState({
      source: null,
      sourceView,
      targetType: articles,
      hasSelection: false,
    })).toBeNull()
  })

  it('asks for a row when the source view has no selection', () => {
    const state = peerEmptyState({
      source,
      sourceView,
      targetType: articles,
      hasSelection: false,
    })
    expect(state?.kind).toBe('no-selection')
    expect(state?.text).toBe('Select a row in Products')
    expect(state?.showAll).toBe('Show all')
  })

  it('names a source that no longer exists', () => {
    const state = peerEmptyState({
      source,
      sourceView: null,
      targetType: articles,
      hasSelection: false,
    })
    expect(state?.kind).toBe('missing-source')
    expect(state?.text).toBe(copy.sourceMissing)
    expect(state?.showAll).toBe('Show all')
  })

  it('reports no linked objects only after the lookup settles', () => {
    const state = peerEmptyState({
      source,
      sourceView,
      targetType: articles,
      hasSelection: true,
      selectionLabel: 'Cheese',
      linkedCount: 0,
    })
    expect(state?.kind).toBe('no-linked')
    expect(state?.text).toBe('No linked Articles for Cheese')
    expect(state?.showAll).toBe('Show all')
  })

  it('stays out of the way while links are unknown or present', () => {
    const base = {
      source,
      sourceView,
      targetType: articles,
      hasSelection: true,
      selectionLabel: 'Cheese',
    }
    expect(peerEmptyState({ ...base, linkedCount: null })).toBeNull()
    expect(peerEmptyState({ ...base, linkedCount: 2 })).toBeNull()
  })
})
