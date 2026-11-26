import { describe, expect, it } from 'vitest'
import { rowsFromCatalog, rowsFromDefinitions } from './attribute-rows'

describe('attribute rows', () => {
  it('maps description from definitions and catalog', () => {
    const defs = {
      attributes: [
        {
          id: 'a1',
          key: 'brand',
          labels: { en: 'Brand' },
          description: 'Who makes it',
          kind: { type: 'text' },
        },
      ],
    }
    const fromDefs = rowsFromDefinitions(defs, undefined)
    expect(fromDefs[0]?.description).toBe('Who makes it')

    const catalog = {
      attributes: [{ id: 'a1', key: 'brand', label: 'Brand', kind: 'text', description: 'Catalog help' }],
    }
    expect(rowsFromCatalog(catalog)[0]?.description).toBe('Catalog help')
  })
})