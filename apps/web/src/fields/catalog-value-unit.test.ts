import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fieldCatalogForType, type DefsJson } from './catalog'
import { columnTitle, fieldPathForPath, makeViewColumn } from './columns'
import { formatCellValue, type AppliedQualifier } from './qualifiers'

const fixture = {
  languages: ['en'],
  unit_families: [
    {
      id: 'u-mass',
      key: 'mass',
      base_unit: 'g',
      units: [
        { code: 'g', factor: '1' },
        { code: 'kg', factor: '1000' },
      ],
    },
  ],
  attributes: [
    {
      id: 'a-weight',
      key: 'net_weight',
      labels: { en: 'Net weight' },
      kind: { type: 'number', unit_family: 'u-mass' },
    },
    {
      id: 'a-sku',
      key: 'sku',
      labels: { en: 'SKU' },
      kind: { type: 'text' },
    },
  ],
  types: [{ id: 't-product', key: 'product', labels: { en: 'Product' }, attributes: ['a-weight', 'a-sku'] }],
  structures: [],
} satisfies DefsJson

const demo = JSON.parse(
  readFileSync(new URL('../../../../crates/server/demo/definitions.json', import.meta.url), 'utf8'),
) as DefsJson

function catalogOf(defs: DefsJson) {
  const catalog = fieldCatalogForType(defs, 'product')
  return { catalog, fields: new Map(catalog.map((field) => [field.id, field])) }
}

describe('measured value and unit catalog fields', () => {
  it('adds value and unit siblings for a number with a unit family', () => {
    const { fields } = catalogOf(fixture)
    expect([...fields.keys()]).toEqual(['net_weight', 'net_weight.value', 'net_weight.unit', 'sku'])
    expect(fields.get('net_weight')?.shape).toBe('unit')
    expect(fields.get('net_weight.value')).toMatchObject({
      name: 'Net weight (value)',
      typeLabel: 'number',
      shape: 'number',
    })
    expect(fields.get('net_weight.unit')).toMatchObject({
      name: 'Net weight (unit)',
      typeLabel: 'text',
      shape: 'text',
    })
  })

  it('offers the same paths the API path list uses and keeps the combined column', () => {
    const { catalog } = catalogOf(demo)
    const value = makeViewColumn(['fat_content.value'], [], catalog)
    const unit = makeViewColumn(['fat_content.unit'], [], catalog)
    const combined = makeViewColumn(['fat_content'], [], catalog)
    expect(value?.path).toBe('fat_content.value')
    expect(unit?.path).toBe('fat_content.unit')
    expect(combined?.path).toBe('fat_content')
    expect(value && columnTitle(value)).toBe('Fat content (value)')
    expect(unit && columnTitle(unit)).toBe('Fat content (unit)')
    expect(combined && columnTitle(combined)).toBe('Fat content')
    expect(value?.id).toBe('fat_content.value')
    expect(unit?.id).toBe('fat_content.unit')
    expect(value?.id).not.toBe(unit?.id)
  })

  it('keeps the parts when a stored column is rebuilt after reload', () => {
    const { catalog } = catalogOf(demo)
    expect(fieldPathForPath('fat_content.value', catalog)).toEqual(['fat_content.value'])
    expect(fieldPathForPath('fat_content.unit', catalog)).toEqual(['fat_content.unit'])
    expect(fieldPathForPath('fat_content', catalog)).toEqual(['fat_content'])
    expect(fieldPathForPath('allergens.code', catalog)).toEqual(['allergens'])
  })

  it('labels the demo Product fields with their group source', () => {
    const { fields } = catalogOf(demo)
    expect(fields.get('fat_content')?.source).toBe('Dairy & eggs')
    expect(fields.get('fat_content.value')?.source).toBe('Dairy & eggs')
    expect(fields.get('fat_content.unit')?.source).toBe('Dairy & eggs')
    expect(fields.has('cocoa_content.value')).toBe(false)
    expect(fields.has('cocoa_content.unit')).toBe(false)
  })

  it('still converts a display unit on the combined column only', () => {
    const { catalog, fields } = catalogOf(demo)
    const kg: AppliedQualifier = { kind: 'unit', optionId: 'kg', label: 'kg' }
    const converted = makeViewColumn(['fat_content'], [kg], catalog)
    expect(converted?.path).toBe('fat_content')
    expect(converted?.id).toContain('#unit:kg')
    expect(makeViewColumn(['fat_content.value'], [kg], catalog)?.path).toBe('fat_content.value')
    expect(makeViewColumn(['fat_content.unit'], [kg], catalog)?.path).toBe('fat_content.unit')
    expect(formatCellValue({ value: { value: 3500, unit: 'g' } }, fields.get('fat_content')!, [kg])).toBe(
      '3.5 kg',
    )
  })
})
