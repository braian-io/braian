import { describe, expect, it } from 'vitest'
import { entityTypesForStructure, showEntityTypeMenuLabel, typeAcceptsStructure } from './structure-tree-show'
import type { TypeName } from './type-labels'

const product: TypeName = {
  id: 't-product',
  key: 'product',
  singular: 'Product',
  plural: 'Products',
  kind: 'entity',
  structures: ['food', 's-food'],
}
const article: TypeName = {
  id: 't-article',
  key: 'article',
  singular: 'Article',
  plural: 'Articles',
  kind: 'entity',
}
const supplier: TypeName = {
  id: 't-supplier',
  key: 'supplier',
  singular: 'Supplier',
  plural: 'Suppliers',
  kind: 'entity',
  structures: [],
}
const link: TypeName = {
  id: 't-link',
  key: 'product_supplier',
  singular: 'Link',
  plural: 'Links',
  kind: 'link',
}

describe('typeAcceptsStructure', () => {
  it('matches structure key or id on the type', () => {
    expect(typeAcceptsStructure(product, 'food', 's-food')).toBe(true)
    expect(typeAcceptsStructure({ ...product, structures: ['s-food'] }, 'food', 's-food')).toBe(true)
    expect(typeAcceptsStructure({ ...product, structures: ['other'] }, 'food', 's-food')).toBe(false)
  })

  it('rejects link types and types with no trees', () => {
    expect(typeAcceptsStructure(link, 'food', 's-food')).toBe(false)
    expect(typeAcceptsStructure(supplier, 'food', 's-food')).toBe(false)
  })

  it('allows every tree when structures is undefined', () => {
    expect(typeAcceptsStructure(article, 'food', 's-food')).toBe(true)
    expect(typeAcceptsStructure(article, 'size', 's-size')).toBe(true)
  })
})

describe('entityTypesForStructure', () => {
  const types = [product, article, supplier, link]

  it('lists every matching entity type in plural-name order', () => {
    expect(entityTypesForStructure('food', 's-food', types).map((type) => type.key)).toEqual(['article', 'product'])
  })

  it('returns nothing when no type accepts the tree', () => {
    expect(entityTypesForStructure('size', 's-size', [product, supplier])).toEqual([])
  })
})

describe('showEntityTypeMenuLabel', () => {
  it('uses the plural type name from the model', () => {
    expect(showEntityTypeMenuLabel(product)).toBe('Show Products')
    expect(showEntityTypeMenuLabel(article)).toBe('Show Articles')
  })
})