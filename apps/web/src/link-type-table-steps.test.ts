import { describe, expect, it } from 'vitest'
import { buildLinkTypeCreateSteps, buildLinkTypeUpdateSteps } from './link-type-table-steps'
import type { LinkTypeRow } from './link-type-view'

const base: LinkTypeRow = {
  id: 'product_suppliers',
  key: 'product_suppliers',
  fromType: 'product',
  toType: 'supplier',
  fromLabel: 'Suppliers',
  toLabel: 'Products',
  fromCardinality: 'many',
  toCardinality: 'one',
}

describe('link type table steps', () => {
  it('builds create steps with cardinalities', () => {
    expect(buildLinkTypeCreateSteps(base)).toEqual([{
      op: 'create_link_type',
      key: 'product_suppliers',
      label: 'Suppliers',
      from_types: ['product'],
      to_types: ['supplier'],
      from_key: 'suppliers',
      from_label: 'Suppliers',
      to_key: 'products',
      to_label: 'Products',
      from_cardinality: 'many',
      to_cardinality: 'one',
      attributes: [],
    }])
  })

  it('builds update steps only for changed fields', () => {
    const changed = { ...base, fromLabel: 'Vendor list', toCardinality: 'many' as const }
    expect(buildLinkTypeUpdateSteps(base, changed)).toEqual([{
      op: 'update_link_type',
      key: 'product_suppliers',
      from_label: 'Vendor list',
      from_key: 'vendor_list',
      to_cardinality: 'many',
    }])
  })
})