import { describe, expect, it } from 'vitest'
import { copy } from './i18n'
import { validateDetailField } from './detail-field-validate'

describe('validateDetailField', () => {
  it('accepts an unchanged value and an optional empty text', () => {
    expect(validateDetailField({
      required: true,
      kind: { type: 'text' },
      previous: 'Same',
      next: 'Same',
    })).toBe('')
    expect(validateDetailField({
      kind: { type: 'text' },
      previous: 'Old',
      next: '',
    })).toBe('')
  })

  it('rejects an empty required value and text past max length', () => {
    expect(validateDetailField({
      required: true,
      kind: { type: 'text' },
      languageDependent: true,
      previous: { en: 'Old' },
      next: { en: '  ' },
    })).toBe(copy.required)
    expect(validateDetailField({
      kind: { type: 'text', max_length: 3 },
      previous: 'ab',
      next: 'abcd',
    })).toBe('Use at most 3 characters')
  })

  it('rejects a non-numeric number, a fractional integer, a bad date, and a code outside the list', () => {
    expect(validateDetailField({
      kind: { type: 'number' },
      previous: { value: '1', unit: 'kg' },
      next: { value: 'abc', unit: 'kg' },
    })).toBe(copy.fieldInvalidNumber)
    expect(validateDetailField({
      kind: { type: 'number', integer: true },
      previous: 1,
      next: 1.5,
    })).toBe(copy.fieldWholeNumber)
    expect(validateDetailField({
      kind: { type: 'date' },
      previous: '2024-01-02',
      next: '2024-13-02',
    })).toBe(copy.fieldDate)
    expect(validateDetailField({
      kind: { type: 'value_list' },
      options: ['a', 'b'],
      previous: 'a',
      next: 'c',
    })).toBe(copy.fieldChoice)
  })
})
