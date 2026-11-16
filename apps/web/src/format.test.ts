import { describe, expect, it } from 'vitest'
import { formatConvertedMeasure, formatConvertedNumber, formatCount, formatMeasure, formatMeasureStorageNumber, formatTimestamp, formatUnitCode, parseDecimalInput } from './format'

describe('format', () => {
  it('rounds converted numbers for display', () => {
    expect(formatConvertedNumber(485.1816443594646)).toBe('485.18')
    expect(formatConvertedNumber(3.5)).toBe('3.5')
    expect(formatConvertedNumber(3)).toBe('3')
    expect(formatUnitCode('kj')).toBe('kJ')
    expect(formatConvertedMeasure(411.09081845, 'kcal')).toBe('411.09 kcal')
  })

  it('prints a local timestamp as YYYY-MM-DD HH:mm', () => {
    expect(formatTimestamp(new Date(2026, 9, 27, 14, 5))).toBe('2026-10-27 14:05')
    expect(formatTimestamp(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02 03:04')
  })

  it('prints a measure with an English decimal and the entered unit', () => {
    expect(formatMeasure('500', 'g')).toBe('500 g')
    expect(formatMeasure('1500.5', 'kg')).toBe('1,500.5 kg')
    expect(formatMeasure('0.6')).toBe('0.6')
  })

  it('parses decimal commas and formats storage without float noise', () => {
    expect(parseDecimalInput('1,5')).toBe(1.5)
    expect(parseDecimalInput('1,234.5')).toBe(1234.5)
    expect(parseDecimalInput('abc')).toBeNull()
    expect(formatMeasureStorageNumber(418.40000000000003)).toBe('418.4')
  })

  it('groups counts in English', () => {
    expect(formatCount(1240)).toBe('1,240')
    expect(formatCount(0)).toBe('0')
    expect(formatCount('12')).toBe('12')
  })
})
