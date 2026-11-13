import { describe, expect, it } from 'vitest'
import {
  cloneObjectTableView,
  objectTableTemplateForType,
  objectTableViewForType,
  type TypeViewRow,
} from './open-type-view'

const product = { id: 'type-product', key: 'product' }

function view(overrides: Partial<TypeViewRow> = {}): TypeViewRow {
  return {
    id: 'v-products',
    type: 'object_table',
    title: 'Products',
    state: { object_type: product.id, type_key: product.key, table: { sort: 'a_number:asc' } },
    ...overrides,
  }
}

describe('openTypeView helpers', () => {
  it('returns an open matching table and never prefers a closed copy', () => {
    const open = view({ id: 'v-open' })
    const closed = view({ id: 'v-closed' })
    expect(objectTableViewForType([closed, open], product, ['v-open'])?.id).toBe('v-open')
    expect(objectTableViewForType([open, closed], product, [])).toBeUndefined()
  })

  it('returns the open table when every match is already in the layout', () => {
    const open = view()
    expect(objectTableViewForType([open], product, ['v-products'])?.id).toBe('v-products')
  })

  it('matches by type key when the object type id is missing', () => {
    const keyed = view({ state: { type_key: product.key } })
    expect(objectTableViewForType([keyed], product, ['v-products'])?.id).toBe('v-products')
  })

  it('ignores other tables and non-table views', () => {
    expect(objectTableViewForType([
      view({ id: 'v-articles', state: { object_type: 'type-article', type_key: 'article' } }),
      view({ id: 'v-detail', type: 'object_detail' }),
    ], product, [])).toBeUndefined()
  })

  it('finds a closed table only as clone state, never as an open target', () => {
    const closed = view({ id: 'v-closed' })
    expect(objectTableViewForType([closed], product, ['v-open'])).toBeUndefined()
    expect(objectTableTemplateForType([closed], product)?.id).toBe('v-closed')
  })

  it('clones with a fresh id and the same table state', () => {
    const source = view()
    const cloned = cloneObjectTableView(source, 'v-copy', 4)
    expect(cloned).toMatchObject({
      id: 'v-copy',
      type: 'object_table',
      title: 'Products',
      pane: 'center',
      position: 4,
    })
    expect(cloned.state).toEqual(source.state)
    expect(cloned.state).not.toBe(source.state)
  })
})
