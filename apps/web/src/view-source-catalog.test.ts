import { describe, expect, it } from 'vitest'
import { MASTER_CATALOG_ID, SAP_CATALOG_ID } from './catalog-ref'
import { viewSourceLabel } from './view-source'

const types = [{ id: 't1', key: 'product', singular: 'Product', plural: 'Products', kind: 'entity' as const }]
const names = { [SAP_CATALOG_ID]: 'SAP ERP', [MASTER_CATALOG_ID]: 'Master catalog' }

describe('viewSourceLabel with catalog override', () => {
  it('omits the catalog when the view follows the workspace', () => {
    expect(viewSourceLabel(
      { type: 'object_table', state: { type_key: 'product', object_type: 't1' } },
      types,
      { catalogId: MASTER_CATALOG_ID },
      names,
    )).toBe('All Products')
    expect(viewSourceLabel(
      { type: 'object_table', state: { type_key: 'product', object_type: 't1', catalogOverride: { catalogId: SAP_CATALOG_ID } } },
      types,
      { catalogId: SAP_CATALOG_ID },
      names,
    )).toBe('All Products')
  })

  it('appends the catalog name when the override differs', () => {
    expect(viewSourceLabel(
      { type: 'object_table', state: { type_key: 'product', object_type: 't1', catalogOverride: { catalogId: SAP_CATALOG_ID } } },
      types,
      { catalogId: MASTER_CATALOG_ID },
      names,
    )).toBe('All Products · SAP ERP')
  })

  it('ignores legacy state.catalog for the label', () => {
    expect(viewSourceLabel(
      { type: 'object_table', state: { type_key: 'product', object_type: 't1', catalog: 'sap' } },
      types,
      { catalogId: MASTER_CATALOG_ID },
      names,
    )).toBe('All Products')
  })
})
