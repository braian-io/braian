import { describe, expect, it } from 'vitest'
import {
  cloneObjectTableView,
  draftTypeRef,
  objectTableForTypeToken,
  objectTableTemplateForType,
  objectTableViewForPeerRetarget,
  objectTableViewForType,
  type TypeViewRow,
} from './open-type-view'
import { withSourceLock } from './view-source'

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

  it('skips a locked open table for peer retargeting', () => {
    const locked = view({
      state: withSourceLock(view().state, true, { selection: 'node', structureKey: 'food', groupKey: 'milk' }),
    })
    expect(objectTableViewForPeerRetarget([locked], product, ['v-products'])).toBeUndefined()
    expect(objectTableViewForType([locked], product, ['v-products'])?.id).toBe('v-products')
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

  it('opens the product table when Articles is the first object table', () => {
    const articles = view({
      id: 'v-articles',
      title: 'Articles',
      state: { object_type: 'type-article', type_key: 'article' },
    })
    const products = view({ id: 'v-products' })
    expect(objectTableForTypeToken([articles, products], { key: 'product' }, ['v-articles', 'v-products'])?.id).toBe('v-products')
    expect(objectTableForTypeToken([articles, products], { id: 'type-product' }, ['v-articles'])?.id).toBe('v-products')
    expect(objectTableForTypeToken([articles], { key: 'product' }, ['v-articles'])).toBeUndefined()
    expect(objectTableForTypeToken([articles, products], {}, ['v-articles'])).toBeUndefined()
  })

  it('reads the object type from the body or the control that opened it', () => {
    const types = [{ id: 'type-product', key: 'product' }, { id: 'type-article', key: 'article' }]
    expect(draftTypeRef({ type: 'product' }, {}, types)).toEqual({ id: 'type-product', key: 'product' })
    expect(draftTypeRef(undefined, { key: 'article' }, types)).toEqual({ id: 'type-article', key: 'article' })
    expect(draftTypeRef(undefined, {}, types)).toBeNull()
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
