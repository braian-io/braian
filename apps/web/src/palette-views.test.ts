import { describe, expect, it } from 'vitest'
import { viewPaletteRows } from './palette-views'
import type { TypeName } from './type-labels'

const types: TypeName[] = [
  { id: 't-product', key: 'product', singular: 'Product', plural: 'Products' },
]

describe('Open view rows', () => {
  it('omits old agent-run tabs but keeps real views and type rows', () => {
    const rows = viewPaletteRows(
      [
        { id: 'v-tree', title: 'Food', type: 'structure_tree' },
        { id: 'v-products', title: 'Products', type: 'object_table' },
        { id: 'v-graph', title: 'Graph', type: 'graph' },
        { id: 'v-run', title: 'old agent run about this product', type: 'agent' },
      ],
      types,
    )
    const ids = rows.map((row) => row.id)
    const titles = rows.map((row) => row.title)
    expect(ids).not.toContain('view:v-run')
    expect(titles).not.toContain('old agent run about this product')
    expect(ids).toContain('view:v-tree')
    expect(ids).toContain('view:v-products')
    expect(ids).toContain('view:v-graph')
  })

  it('hides the type row when a view with that title is already open', () => {
    const rows = viewPaletteRows(
      [{ id: 'v-products', title: 'Products', type: 'object_table' }],
      types,
    )
    expect(rows.map((row) => row.id)).toEqual(['view:v-products'])
  })
})
