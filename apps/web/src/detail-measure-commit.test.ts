import { describe, expect, it } from 'vitest'
import {
  commitDetailMeasureDraft,
  detailMeasureCommittedText,
  detailMeasureValueUnchanged,
  flushDetailMeasureDraft,
} from './detail-measure-commit'

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
    if (result.ok) {
      expect(result.kind).toBe('committed')
      expect(result.displayText).toBe('1.5')
    }
  })

  it('rejects invalid text on flush without staging', () => {
    expect(commitDetailMeasureDraft('abc', record, 'flush').ok).toBe(false)
  })

  it('rejects whitespace-only on flush', () => {
    expect(commitDetailMeasureDraft('   ', record, 'flush').ok).toBe(false)
  })

  it('allows clearing on blur', () => {
    const result = commitDetailMeasureDraft('   ', record, 'blur')
    expect(result).toEqual({ ok: true, kind: 'committed', next: { ...record, value: '' }, displayText: '' })
  })

  it('treats comma, dot, and trailing-zero text as unchanged on blur', () => {
    const stored = { value: '485.181644', unit: 'kJ' }
    for (const typed of ['485.181644', '485,181644', '0485.1816440', '485.1816440']) {
      const result = commitDetailMeasureDraft(typed, stored, 'blur')
      expect(result).toMatchObject({ ok: true, kind: 'unchanged', displayText: '485.181644' })
    }
  })

  it('commits a real change on blur', () => {
    const result = commitDetailMeasureDraft('500', { value: '485.181644', unit: 'kJ' }, 'blur')
    expect(result).toMatchObject({ ok: true, kind: 'committed', next: { value: '500', unit: 'kJ' } })
  })
})

describe('detailMeasureValueUnchanged', () => {
  const stored = { value: '418.4', unit: 'kJ' }

  it('matches comma and dot forms', () => {
    expect(detailMeasureValueUnchanged('418.4', stored)).toBe(true)
    expect(detailMeasureValueUnchanged('418,4', stored)).toBe(true)
  })

  it('rejects a different number', () => {
    expect(detailMeasureValueUnchanged('419', stored)).toBe(false)
  })
})

describe('flushDetailMeasureDraft', () => {
  it('accepts empty untouched drafts', () => {
    expect(flushDetailMeasureDraft('', { value: '', unit: 'kJ' })).toEqual({ ok: true, kind: 'unchanged' })
    expect(flushDetailMeasureDraft('', { unit: 'kJ' })).toEqual({ ok: true, kind: 'unchanged' })
  })

  it('accepts drafts that still match the committed record', () => {
    const record = { value: '418.4', unit: 'kJ' }
    expect(flushDetailMeasureDraft('418.4', record)).toEqual({ ok: true, kind: 'unchanged' })
    expect(flushDetailMeasureDraft('418,4', record)).toEqual({ ok: true, kind: 'unchanged' })
    expect(flushDetailMeasureDraft('418.40', record)).toEqual({ ok: true, kind: 'unchanged' })
  })

  it('rejects user-cleared values on flush', () => {
    expect(flushDetailMeasureDraft('', { value: '418.4', unit: 'kJ' }).ok).toBe(false)
  })

  it('commits valid edits on flush', () => {
    const record = { value: '418.4', unit: 'kJ' }
    const result = flushDetailMeasureDraft('2', record)
    expect(result.ok).toBe(true)
    if (result.ok && result.kind === 'committed') {
      expect(result.next.value).toBe('2')
    }
  })
})