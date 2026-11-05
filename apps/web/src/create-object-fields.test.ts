import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import { createObjectFields, createObjectFieldValues } from './create-object-fields'

const defs: Json = {
  attributes: [
    { id: 'number', key: 'number', labels: { en: 'Number' }, kind: { type: 'text' }, index: {} },
    { id: 'name', key: 'name', labels: { en: 'Name' }, kind: { type: 'text' }, language_dependent: true, index: {} },
    { id: 'created', key: 'created_at', labels: { en: 'Created' }, kind: { type: 'text' }, index: {} },
    { id: 'updated', key: 'updated_at', labels: { en: 'Updated' }, kind: { type: 'text' }, index: {} },
    { id: 'by', key: 'updated_by', labels: { en: 'Updated by' }, kind: { type: 'text' }, index: {} },
    { id: 'note', key: 'note', labels: { en: 'Note' }, kind: { type: 'text', form: 'long' }, index: {} },
    { id: 'colour', key: 'colour', labels: { en: 'Colour' }, kind: { type: 'value_list', list: 'colour' }, index: {} },
    { id: 'hidden', key: 'hidden', labels: { en: 'Hidden' }, kind: { type: 'text' }, index: {}, show_by_default: false },
    { id: 'weight', key: 'weight', labels: { en: 'Weight' }, kind: { type: 'number', unit_family: 'mass' }, index: {} },
  ],
  unit_families: [{ id: 'mass', key: 'mass', base_unit: 'kg', units: [{ code: 'kg', factor: '1' }] }],
  value_lists: [{ key: 'colour', labels: { en: 'Colour' }, options: [{ code: 'red', labels: { en: 'Red' } }] }],
  types: [{
    key: 'product',
    labels: { en: 'Product' },
    attributes: ['number', 'name', 'created', 'updated', 'by', 'note', 'colour', 'hidden', 'weight'],
  }],
}

describe('create object fields', () => {
  it('splits primary and more by show_by_default and omits server-owned fields', () => {
    const { primary, more } = createObjectFields(defs, 'product')
    expect(primary.map((field) => field.key)).toEqual(['number', 'name', 'note', 'colour', 'weight'])
    expect(more.map((field) => field.key)).toEqual(['hidden'])
    expect([...primary, ...more].some((field) => ['created_at', 'updated_at', 'updated_by'].includes(field.key))).toBe(false)
    expect(primary[0].testId).toBe('new-number')
    expect(primary[1].testId).toBe('new-name')
    expect(primary.find((field) => field.key === 'note')).toMatchObject({ multiline: true })
    expect(primary.find((field) => field.key === 'colour')?.options).toEqual([{ value: 'red', label: 'Red' }])
    expect(primary.find((field) => field.key === 'weight')?.unit).toBe('kg')
  })

  it('lets number and name live under more when they are hidden', () => {
    const hiddenNumber = {
      ...defs,
      attributes: (defs.attributes as Json[]).map((item) => (
        item.key === 'number' ? { ...item, show_by_default: false } : item
      )),
    }
    const { primary, more } = createObjectFields(hiddenNumber, 'product')
    expect(primary.some((field) => field.key === 'number')).toBe(false)
    expect(more[0]).toMatchObject({ key: 'number', testId: 'new-number' })
  })

  it('keeps number and name even when the type does not list them', () => {
    const bare = { ...defs, types: [{ key: 'product', labels: { en: 'Product' }, attributes: ['note'] }] }
    const { primary } = createObjectFields(bare, 'product')
    expect(primary.map((field) => field.key)).toEqual(['number', 'name', 'note'])
  })

  it('builds values only for filled extra fields', () => {
    const fields = [...createObjectFields(defs, 'product').primary, ...createObjectFields(defs, 'product').more]
    const values = createObjectFieldValues(fields, { note: '  hello  ', hidden: ' ', colour: 'red', weight: '12.5' })
    expect(values).toEqual({ note: 'hello', colour: 'red', weight: { value: '12.5', unit: 'kg' } })
  })

  it('wraps language-dependent extra fields in en', () => {
    const bare = {
      ...defs,
      attributes: [
        ...(defs.attributes as Json[]),
        { id: 'desc', key: 'desc', labels: { en: 'Description' }, kind: { type: 'text' }, language_dependent: true, index: {} },
      ],
      types: [{ key: 'product', labels: { en: 'Product' }, attributes: ['desc'] }],
    }
    const { primary } = createObjectFields(bare, 'product')
    expect(createObjectFieldValues(primary, { desc: 'Hej' })).toEqual({ desc: { en: 'Hej' } })
  })
})
