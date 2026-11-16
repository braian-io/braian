import { describe, expect, it } from 'vitest'
import { commitDetailMeasureDraft, detailMeasureCommittedText } from './detail-measure-commit'

describe('detailMeasureCommittedText', () => {
  it('formats stored numbers without grouping', () => {
    expect(detailMeasureCommittedText({ value: '2000', unit: 'kJ' })).toBe('2000')
  })
})

describe('commitDetailMeasureDraft', () => {
  const record = { value: '418.4', unit: 'kJ' }

  it('parses comma decimals on flush', () => {
    const result = commitDetailMeasureDraft('1,5', record, 'flush')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.displayText).toBe('1.5')
  })

  it('rejects invalid text on flush without staging', () => {
    expect(commitDetailMeasureDraft('abc', record, 'flush').ok).toBe(false)
  })

  it('rejects whitespace-only on flush', () => {
    expect(commitDetailMeasureDraft('   ', record, 'flush').ok).toBe(false)
  })

  it('allows clearing on blur', () => {
    const result = commitDetailMeasureDraft('   ', record, 'blur')
    expect(result).toEqual({ ok: true, next: { ...record, value: '' }, displayText: '' })
  })
})