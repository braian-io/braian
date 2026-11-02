import { describe, expect, it } from 'vitest'
import { SAP_CATALOG_ID } from './catalog-ref'
import {
  isSwitchCatalogRoot,
  parseSwitchCatalogChoice,
  SWITCH_CATALOG_ROOT_ID,
  switchCatalogEventDetail,
  switchCatalogSubmenuRows,
} from './palette-switch-catalog'

describe('palette switch catalog', () => {
  it('builds submenu rows keyed by catalogId', () => {
    const rows = switchCatalogSubmenuRows([
      { id: '018f1000-0000-7000-8000-000000000001', key: 'master', name: 'Master catalog' },
      { id: SAP_CATALOG_ID, key: 'sap', name: 'SAP ERP' },
    ])
    expect(rows.map((row) => row.id)).toEqual([
      'catalog:018f1000-0000-7000-8000-000000000001',
      `catalog:${SAP_CATALOG_ID}`,
    ])
    expect(parseSwitchCatalogChoice(`catalog:${SAP_CATALOG_ID}`)).toBe(SAP_CATALOG_ID)
    expect(parseSwitchCatalogChoice(SWITCH_CATALOG_ROOT_ID)).toBeNull()
    expect(isSwitchCatalogRoot(SWITCH_CATALOG_ROOT_ID)).toBe(true)
  })

  it('targets the focused view and falls back to the workspace', () => {
    expect(switchCatalogEventDetail(SAP_CATALOG_ID, 'view-1')).toEqual({
      scope: 'view',
      viewId: 'view-1',
      catalogId: SAP_CATALOG_ID,
    })
    expect(switchCatalogEventDetail(SAP_CATALOG_ID, null)).toEqual({
      scope: 'workspace',
      catalogId: SAP_CATALOG_ID,
    })
    expect(switchCatalogEventDetail(SAP_CATALOG_ID, undefined)).toEqual({
      scope: 'workspace',
      catalogId: SAP_CATALOG_ID,
    })
  })
})
