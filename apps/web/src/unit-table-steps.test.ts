import { describe, expect, it } from 'vitest'
import { copy } from './i18n'
import { assertUnitFamilies, normalizeUnitNumber, unitNumberError, unitSaveSteps, type UnitDraftRow } from './unit-table-steps'

function row(patch: Partial<UnitDraftRow> & Pick<UnitDraftRow, 'id' | 'code'>): UnitDraftRow {
  return {
    familyKey: 'mass',
    factor: '1',
    offset: '0',
    symbol: patch.code,
    label: patch.code,
    isBase: false,
    ...patch,
  }
}

describe('unit table steps', () => {
  it('keeps a decimal comma exact', () => {
    expect(normalizeUnitNumber('0,5555555555555555555555555556', '1')).toBe('0.5555555555555555555555555556')
    expect(normalizeUnitNumber('-17,777777777777777777777777778', '0')).toBe('-17.777777777777777777777777778')
    expect(unitNumberError('1,5', 'factor')).toBeUndefined()
    expect(unitNumberError('abc', 'factor')).toBe(copy.linkFieldNumber)
    expect(unitNumberError('0', 'factor')).toBe(copy.linkFieldNumber)
    expect(unitNumberError('-1,5', 'offset')).toBeUndefined()
    expect(unitNumberError('', 'offset')).toBeUndefined()
  })

  it('saves factor, offset, symbol, labels and a new base', () => {
    const stored = [
      row({ id: 'mass:g', code: 'g', isBase: true, symbol: 'g', label: 'Gram' }),
      row({ id: 'mass:kg', code: 'kg', factor: '1000', offset: '0', symbol: 'kg', label: 'Kilogram' }),
    ]
    const steps = unitSaveSteps(stored, {
      'mass:kg': row({
        id: 'mass:kg',
        code: 'kg',
        factor: '1',
        offset: '0',
        symbol: 'kg',
        label: 'Kilo',
        isBase: true,
      }),
      'mass:g': row({
        id: 'mass:g',
        code: 'g',
        factor: '0,001',
        offset: '0',
        symbol: 'g',
        label: 'Gram',
        isBase: false,
      }),
    })
    expect(steps).toEqual([
      {
        name: 'model.update_unit',
        args: {
          unit_family: 'mass',
          unit: 'kg',
          factor: '1',
          offset: '0',
          symbol: 'kg',
          label: 'Kilo',
          base_unit: 'kg',
        },
      },
      {
        name: 'model.update_unit',
        args: {
          unit_family: 'mass',
          unit: 'g',
          factor: '0.001',
          offset: '0',
          symbol: 'g',
          label: 'Gram',
        },
      },
    ])
  })

  it('refuses two base units', () => {
    expect(() =>
      assertUnitFamilies([
        row({ id: 'mass:g', code: 'g', isBase: true }),
        row({ id: 'mass:kg', code: 'kg', factor: '1', offset: '0', isBase: true }),
      ]),
    ).toThrow(copy.unitBase)
  })
})
