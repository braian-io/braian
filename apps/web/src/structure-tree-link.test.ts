import { describe, expect, it } from 'vitest'
import { objectTablesToAutoLinkToTree, typeAcceptsStructureTree } from './structure-tree-link'
import type { TypeName } from './type-labels'
import { applyPeerSource, applyTypeSource } from './view-source'

const product: TypeName = {
  id: 't-product',
  key: 'product',
  singular: 'Product',
  plural: 'Products',
  kind: 'entity',
  structures: ['food'],
}
const article: TypeName = {
  id: 't-article',
  key: 'article',
  singular: 'Article',
  plural: 'Articles',
  kind: 'entity',
}
const defs = {
  structures: [{ id: 's-food', key: 'food', groups: [] }],
}

describe('typeAcceptsStructureTree', () => {
  it('requires overlap when the type lists allowed trees', () => {
    expect(typeAcceptsStructureTree(product, defs)).toBe(true)
    expect(typeAcceptsStructureTree({ ...product, structures: ['other'] }, defs)).toBe(false)
  })

  it('rejects types with an empty structures list', () => {
    expect(typeAcceptsStructureTree({ ...product, structures: [] }, defs)).toBe(false)
  })

  it('allows any tree when structures is undefined', () => {
    expect(typeAcceptsStructureTree(article, defs)).toBe(true)
  })
})

describe('objectTablesToAutoLinkToTree', () => {
  const treeId = 'tree-food'
  const productsId = 'tbl-products'
  const articlesId = 'tbl-articles'
  const views = [
    { id: treeId, type: 'structure_tree', title: 'Food', state: {} },
    {
      id: productsId,
      type: 'object_table',
      title: 'Products',
      state: applyTypeSource({ object_type: product.id, type_key: product.key }, product),
    },
    {
      id: articlesId,
      type: 'object_table',
      title: 'Articles',
      state: { object_type: article.id, type_key: article.key },
    },
    {
      id: 'tbl-linked',
      type: 'object_table',
      title: 'Linked',
      state: applyPeerSource(
        { object_type: article.id, type_key: article.key },
        'other-table',
        'row',
      ),
    },
  ]

  it('links open product tables without a peer, including explicit All', () => {
    const ids = objectTablesToAutoLinkToTree(treeId, views, [product, article], [treeId, productsId], defs)
    expect(ids).toEqual([productsId])
  })

  it('skips tables that already follow another source', () => {
    const ids = objectTablesToAutoLinkToTree(
      treeId,
      views,
      [product, article],
      [treeId, productsId, 'tbl-linked'],
      defs,
    )
    expect(ids).toEqual([productsId])
  })

  it('does nothing when the tree is not open', () => {
    expect(objectTablesToAutoLinkToTree(treeId, views, [product], [productsId], defs)).toEqual([])
  })
})