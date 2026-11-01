import { describe, expect, it } from 'vitest'
import { MASTER_CATALOG_ID, SAP_CATALOG_ID } from './catalog-ref'
import { catalogKeyOf, workspaceCatalogRef } from './catalog-scope'

const keys = {
  [MASTER_CATALOG_ID]: 'master',
  [SAP_CATALOG_ID]: 'sap',
}

describe('catalogKeyOf via shared resolver', () => {
  it('uses catalogOverride when set', () => {
    expect(catalogKeyOf(
      { catalogOverride: { catalogId: SAP_CATALOG_ID } },
      { catalogId: MASTER_CATALOG_ID },
      keys,
    )).toBe('sap')
  })

  it('follows the workspace when there is no override', () => {
    expect(catalogKeyOf({}, { catalogId: SAP_CATALOG_ID }, keys)).toBe('sap')
  })

  it('ignores legacy state.catalog strings', () => {
    expect(catalogKeyOf({ catalog: 'sap' }, { catalogId: MASTER_CATALOG_ID }, keys)).toBe('master')
  })

  it('defaults to master when workspace.catalog is missing', () => {
    expect(catalogKeyOf({}, null, keys)).toBe('master')
    expect(workspaceCatalogRef({})).toBeNull()
  })
})
