import { describe, expect, it } from 'vitest'
import { buildAttributeCreateSteps, buildAttributeUpdateSteps, type AttributeStepRow } from './attribute-table-steps'

const defs = { attributes: [] as Array<{ key: string }>, types: [], unit_families: [] }

function row(overrides: Partial<AttributeStepRow> = {}): AttributeStepRow {
  return {
    id: 'attr-1',
    key: 'attr_1',
    label: 'Attr',
    description: '',
    kind: 'text',
    unit: '',
    defaultUnit: '',
    required: false,
    showByDefault: true,
    languages: true,
    searchable: false,
    filterable: false,
    sortable: false,
    inherited: false,
    fromKey: '',
    standard: false,
    multiple: false,
    min: '',
    max: '',
    valueList: '',
    integer: false,
    maxLength: '',
    textForm: '',
    media: false,
    ...overrides,
  }
}

describe('attribute table steps', () => {
  it('emits rule fields on create', () => {
    expect(buildAttributeCreateSteps(defs, row({
      kind: 'number',
      min: '1',
      max: '12',
      integer: true,
      filterable: true,
    }), { op: 'attach_attribute', attribute: 'attr_1', type_key: 'product' })).toEqual([
      {
        op: 'create_attribute',
        key: 'attr_1',
        label: 'Attr',
        kind: 'number',
        multiple: false,
        languages: false,
        required: false,
        show_by_default: true,
        searchable: false,
        filterable: true,
        sortable: false,
        min: '1',
        max: '12',
        integer: true,
      },
      { op: 'attach_attribute', attribute: 'attr_1', type_key: 'product' },
    ])
  })

  it('emits text and value list bounds on create', () => {
    expect(buildAttributeCreateSteps(defs, row({
      kind: 'text',
      maxLength: '40',
      textForm: 'long',
    }), { op: 'attach_attribute', attribute: 'attr_1' })[0]).toMatchObject({
      max_length: 40,
      text_form: 'long',
    })
    expect(buildAttributeCreateSteps(defs, row({
      kind: 'value_list',
      valueList: 'status',
    }), { op: 'attach_attribute', attribute: 'attr_1' })[0]).toMatchObject({
      value_list: 'status',
    })
  })

  it('emits clear flags and toggles on update', () => {
    const original = row({ kind: 'number', min: '1', max: '12', integer: true, filterable: false })
    const next = row({ kind: 'number', min: '', max: '9', integer: false, filterable: true, multiple: true })
  expect(buildAttributeUpdateSteps(defs, original, next, '')).toEqual([
      {
        op: 'update_attribute',
        key: 'attr_1',
        clear_min: true,
        max: '9',
        integer: false,
        filterable: true,
        multiple: true,
      },
    ])
  })

  it('does not emit inapplicable bounds when kind is not number', () => {
    const original = row({ kind: 'text' })
    const next = row({ kind: 'text', min: '1', max: '2', integer: true })
    expect(buildAttributeUpdateSteps(defs, original, next, '')).toEqual([])
  })

  it('emits description on create and clear on update', () => {
    expect(
      buildAttributeCreateSteps(
        defs,
        row({ description: 'Helps editors' }),
        { op: 'attach_attribute', attribute: 'attr_1' },
      )[0],
    ).toMatchObject({ description: 'Helps editors' })
    const original = row({ description: 'Old help' })
    expect(buildAttributeUpdateSteps(defs, original, row({ description: 'New help' }), '')).toEqual([
      { op: 'update_attribute', key: 'attr_1', description: 'New help' },
    ])
    expect(buildAttributeUpdateSteps(defs, original, row({ description: '' }), '')).toEqual([
      { op: 'update_attribute', key: 'attr_1', clear_description: true },
    ])
  })

  it('clears max length and value list when emptied', () => {
    const original = row({ kind: 'text', maxLength: '40', textForm: 'long' })
    const next = row({ kind: 'text', maxLength: '', textForm: '' })
    expect(buildAttributeUpdateSteps(defs, original, next, '')).toEqual([
      { op: 'update_attribute', key: 'attr_1', clear_max_length: true, text_form: 'short' },
    ])
    const listOriginal = row({ kind: 'value_list', valueList: 'status' })
    const listNext = row({ kind: 'value_list', valueList: '' })
    expect(buildAttributeUpdateSteps(defs, listOriginal, listNext, '')).toEqual([
      { op: 'update_attribute', key: 'attr_1', clear_value_list: true },
    ])
  })
})