import { describe, expect, it } from 'vitest'
import {
  MASTER_CATALOG_ID,
  SAP_CATALOG_ID,
  catalogOverrideDiffers,
  catalogRefOf,
  effectiveCatalogId,
  viewCatalogOverrideRef,
} from './catalog-ref'

describe('effectiveCatalogId (shared resolver)', () => {
  it('prefers the view override', () => {
    expect(effectiveCatalogId({ catalogId: SAP_CATALOG_ID }, { catalogId: MASTER_CATALOG_ID })).toBe(SAP_CATALOG_ID)
  })

  it('falls back to the workspace catalog', () => {
    expect(effectiveCatalogId(null, { catalogId: SAP_CATALOG_ID })).toBe(SAP_CATALOG_ID)
  })

  it('falls back to the default catalog when workspace.catalog is missing', () => {
    expect(effectiveCatalogId(null, null)).toBe(MASTER_CATALOG_ID)
    expect(effectiveCatalogId(undefined, undefined, MASTER_CATALOG_ID)).toBe(MASTER_CATALOG_ID)
  })

  it('does not guess from views when workspace catalog is missing', () => {
    // Even if a legacy string key sat on the view, override ref is null.
    expect(viewCatalogOverrideRef({ catalog: 'sap' })).toBeNull()
    expect(effectiveCatalogId(viewCatalogOverrideRef({ catalog: 'sap' }), null)).toBe(MASTER_CATALOG_ID)
  })
})

describe('catalogOverride shape', () => {
  it('reads only catalogOverride: { catalogId }', () => {
    expect(viewCatalogOverrideRef({ catalogOverride: { catalogId: SAP_CATALOG_ID } })).toEqual({
      catalogId: SAP_CATALOG_ID,
    })
    expect(viewCatalogOverrideRef({ catalog: 'sap' })).toBeNull()
    expect(viewCatalogOverrideRef({ catalogOverride: 'sap' })).toBeNull()
    expect(catalogRefOf({ catalogId: MASTER_CATALOG_ID })).toEqual({ catalogId: MASTER_CATALOG_ID })
  })

  it('differs only when override ≠ workspace', () => {
    expect(catalogOverrideDiffers({ catalogId: SAP_CATALOG_ID }, { catalogId: MASTER_CATALOG_ID })).toBe(true)
    expect(catalogOverrideDiffers({ catalogId: SAP_CATALOG_ID }, { catalogId: SAP_CATALOG_ID })).toBe(false)
    expect(catalogOverrideDiffers(null, { catalogId: MASTER_CATALOG_ID })).toBe(false)
  })
})
