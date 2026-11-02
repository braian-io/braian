import { describe, expect, it } from 'vitest'
import {
  applyPeerSource,
  applyTypeSource,
  isExplicitAllSource,
  isObjectTableView,
  linkedTypeIds,
  peerIdsFilter,
  peerNodeFilter,
  peerSourceLabel,
  peerSourceOf,
  viewSourceLabel,
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
