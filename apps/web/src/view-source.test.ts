import { describe, expect, it } from 'vitest'
import { applyTypeSource, isObjectTableView, viewSourceLabel } from './view-source'
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
