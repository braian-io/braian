import { describe, expect, it } from 'vitest'
import {
  applyLinkTypePatches,
  linkTypesTableDraftKey,
  restoreLinkTypesTableDraft,
  serializeLinkTypeDraftRow,
} from './link-type-table-draft-persist'
import type { LinkTypeRow } from './link-type-view'

const server: LinkTypeRow = {
  id: 'product_suppliers',
  key: 'product_suppliers',
  fromType: 'product',
  toType: 'supplier',
  fromLabel: 'Suppliers',
  toLabel: 'Products',
  fromCardinality: 'many',
  toCardinality: 'one',
}

describe('link type draft persistence', () => {
  it('uses a stable storage key for the link types table', () => {
    expect(linkTypesTableDraftKey('user', 'workspace')).toBe('braian.model-table-draft.user.workspace.__link_types_table__')
  })

  it('restores patch rows onto the server state', () => {
    const stored = {
      v: 1 as const,
      draftRows: {
        product_suppliers: {
          patch: true as const,
          id: 'product_suppliers',
          key: 'product_suppliers',
          changes: { fromCardinality: { base: 'many', value: 'one' } },
        },
      },
    }
    const { draftRows } = restoreLinkTypesTableDraft(stored, [server])
    expect(draftRows.product_suppliers?.fromCardinality).toBe('one')
    expect(applyLinkTypePatches(server, { fromCardinality: { base: 'many', value: 'one' } }).fromCardinality).toBe('one')
  })

  it('drops a patch the server already has', () => {
    const stored = {
      v: 1 as const,
      draftRows: {
        product_suppliers: {
          patch: true as const,
          id: 'product_suppliers',
          key: 'product_suppliers',
          changes: { fromLabel: { base: 'Suppliers', value: 'Suppliers' } },
        },
      },
    }
    const { draftRows } = restoreLinkTypesTableDraft(stored, [server])
    expect(draftRows.product_suppliers).toBeUndefined()
  })

  it('serializes only changed fields', () => {
    const edited = { ...server, toLabel: 'Catalog' }
    expect(serializeLinkTypeDraftRow(server, edited)).toMatchObject({
      patch: true,
      changes: { toLabel: { base: 'Products', value: 'Catalog' } },
    })
  })
})