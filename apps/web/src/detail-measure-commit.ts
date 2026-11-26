import { textValue, type Json } from './api'
import { formatMeasureEditNumber, formatMeasureStorageNumber, parseDecimalInput } from './format'
export type MeasureFieldRecord = Json & { value?: unknown; unit?: unknown }

/** Text shown in a detail measure value input from the committed record. */
export function detailMeasureCommittedText(record: MeasureFieldRecord): string {
  return record.value != null && record.value !== ''
    ? formatMeasureEditNumber(record.value)
    : textValue(record.value)
}

export type DetailMeasureCommitMode = 'blur' | 'flush'

export type DetailMeasureCommitResult =
  | { ok: true; kind: 'unchanged'; displayText: string }
  | { ok: true; kind: 'committed'; next: MeasureFieldRecord; displayText: string }
  | { ok: false }

/** Whether typed text is the same stored number as on the record (comma/dot, leading/trailing zeros). */
export function detailMeasureValueUnchanged(text: string, record: MeasureFieldRecord): boolean {
  const trimmed = text.trim()
  const storedText = String(record.value ?? '').trim()
  if (!trimmed) return storedText === ''
  const parsed = parseDecimalInput(text)
  if (parsed == null) return false
  if (storedText === '') return false
  const storedNum = typeof record.value === 'number'
    ? record.value
    : parseDecimalInput(storedText)
  if (storedNum == null || !Number.isFinite(storedNum)) return false
  return formatMeasureStorageNumber(parsed) === formatMeasureStorageNumber(storedNum)
}

/**
 * Parse a detail measure draft. Flush (Save) rejects invalid input without staging.
 * Blur may stage a cleared value when the field is empty.
 */
export type FlushDetailMeasureResult =
  | { ok: true; kind: 'unchanged' }
  | { ok: true; kind: 'committed'; next: MeasureFieldRecord; displayText: string }
  | { ok: false }

/** Save-time commit: unchanged drafts (including empty untouched) are valid. */
export function flushDetailMeasureDraft(text: string, record: MeasureFieldRecord): FlushDetailMeasureResult {
  if (detailMeasureValueUnchanged(text, record)) {
    return { ok: true, kind: 'unchanged' }
  }
  const result = commitDetailMeasureDraft(text, record, 'flush')
  if (!result.ok) return { ok: false }
  if (result.kind === 'unchanged') return { ok: true, kind: 'unchanged' }
  return { ok: true, kind: 'committed', next: result.next, displayText: result.displayText }
}

export function commitDetailMeasureDraft(
  text: string,
  record: MeasureFieldRecord,
  mode: DetailMeasureCommitMode,
): DetailMeasureCommitResult {
  const trimmed = text.trim()
  if (!trimmed) {
    if (mode === 'blur') {
      if (detailMeasureValueUnchanged(text, record)) {
        return { ok: true, kind: 'unchanged', displayText: detailMeasureCommittedText(record) }
      }
      return { ok: true, kind: 'committed', next: { ...record, value: '' }, displayText: '' }
    }
    return { ok: false }
  }
  const parsed = parseDecimalInput(text)
  if (parsed == null) return { ok: false }
  const stored = formatMeasureStorageNumber(parsed)
  const displayText = formatMeasureEditNumber(stored)
  if (detailMeasureValueUnchanged(text, record)) {
    return { ok: true, kind: 'unchanged', displayText }
  }
  return {
    ok: true,
    kind: 'committed',
    next: { ...record, value: stored },
    displayText,
  }
}