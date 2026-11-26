import { describe, expect, it } from 'vitest'
import { catalogDeleteAvailable, selectedCatalogRow } from './catalog-selection'

const rows = [
  { id: 'master', key: 'master' },
  { id: 'sap', key: 'sap' },
]

describe('selectedCatalogRow', () => {
  it('does not fall back to the first row when nothing is selected', () => {
    expect(selectedCatalogRow(rows, null)).toBeNull()
    expect(selectedCatalogRow(rows, 'missing')).toBeNull()
    expect(selectedCatalogRow(rows, 'sap')?.key).toBe('sap')
  })
})

describe('catalogDeleteAvailable', () => {
  it('hides Delete catalog until a row with a key is selected', () => {
    expect(catalogDeleteAvailable(null)).toBe(false)
    expect(catalogDeleteAvailable({ key: '' })).toBe(false)
    expect(catalogDeleteAvailable({ key: 'master' })).toBe(true)
    expect(catalogDeleteAvailable({ key: 'sap' })).toBe(true)
  })
})
