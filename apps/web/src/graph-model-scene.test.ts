import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import { buildModelScene, expandModelType, linkEdgeLabel } from './graph-model-scene'

const defs: Json = {
  types: [
    { id: 't-supplier', key: 'supplier', kind: 'entity', labels: { en: 'Supplier' }, structures: ['s-catalog'] },
    { id: 't-article', key: 'article', kind: 'entity', labels: { en: 'Article' } },
    { id: 't-product', key: 'product', kind: 'entity', labels: { en: 'Product' } },
    {
      id: 'l-supplier-articles',
      key: 'supplier_articles',
      kind: 'link',
      labels: { en: 'Supplier' },
      link: {
        from_types: ['t-supplier'],
        to_types: ['t-article'],
        from_cardinality: 'one',
        to_cardinality: 'many',
      },
    },
    {
      id: 'l-product-articles',
      key: 'product_articles',
      kind: 'link',
      labels: { en: 'Product' },
      link: {
        from_types: ['t-supplier', 't-product'],
        to_types: ['t-article'],
        from_cardinality: 'one',
        to_cardinality: 'one',
      },
    },
  ],
  structures: [
    {
      id: 's-catalog',
      key: 'catalog',
      labels: { en: 'Catalog' },
      groups: [
        { id: 'g-retail', key: 'retail', labels: { en: 'Retail' } },
        { id: 'g-online', key: 'online', parent: 'g-retail', labels: { en: 'Online' } },
      ],
    },
  ],
}


const stats: Json = {
  by_type: [
    { type: 'supplier', count: 3 },
    { type: 'article', count: 8 },
  ],
}

describe('model graph scene', () => {
  it('creates one type node per object type and uses the stat counts', () => {
    const scene = buildModelScene(defs, stats)
    const types = scene.nodes.filter((node) => node.kind === 'type')
    expect(types.map((node) => node.caption).sort()).toEqual(['Article', 'Product', 'Supplier'])
    expect(types.find((node) => node.typeKey === 'supplier')?.subtitle).toBe('3')
    expect(types.find((node) => node.typeKey === 'article')?.subtitle).toBe('8')
  })

  it('reports zero for a type missing from by_type', () => {
    const scene = buildModelScene(defs, stats)
    expect(scene.nodes.find((node) => node.typeKey === 'product')?.subtitle).toBe('0')
  })

  it('labels an edge with the link name and cardinality', () => {
    const scene = buildModelScene(defs, stats)
    const edge = scene.edges.find((item) => item.source === 'type:supplier' && item.target === 'type:article')
    expect(edge?.label).toBe('Supplier 1–n')
    expect(linkEdgeLabel('Product', { from_cardinality: 'one', to_cardinality: 'one' })).toBe('Product 1–1')
  })

  it('creates one edge per from/to type pair', () => {
    const scene = buildModelScene(defs, stats)
    const edges = scene.edges.filter((edge) => edge.label.startsWith('Product '))
    expect(edges).toHaveLength(2)
    expect(edges.map((edge) => edge.source).sort()).toEqual(['type:product', 'type:supplier'])
  })

  it('expands a type into its structure groups', () => {
    const scene = expandModelType(defs, 'supplier')
    expect(scene.nodes.some((node) => node.id === 'structure:catalog' && node.kind === 'structure')).toBe(true)
    expect(scene.nodes.some((node) => node.id === 'group:catalog:retail' && node.kind === 'group')).toBe(true)
    expect(scene.nodes.some((node) => node.id === 'group:catalog:online' && node.kind === 'group')).toBe(true)
    expect(scene.edges.some((edge) => edge.source === 'type:supplier' && edge.target === 'structure:catalog')).toBe(true)
  })
})
