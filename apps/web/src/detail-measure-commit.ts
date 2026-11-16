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
  | { ok: true; next: MeasureFieldRecord; displayText: string }
  | { ok: false }

/**
 * Parse a detail measure draft. Flush (Save) rejects invalid input without staging.
 * Blur may stage a cleared value when the field is empty.
 */
export function commitDetailMeasureDraft(
  text: string,
  record: MeasureFieldRecord,
  mode: DetailMeasureCommitMode,
): DetailMeasureCommitResult {
  const trimmed = text.trim()
  if (!trimmed) {
    if (mode === 'blur') {
      return { ok: true, next: { ...record, value: '' }, displayText: '' }
    }
    return { ok: false }
  }
  const parsed = parseDecimalInput(text)
  if (parsed == null) return { ok: false }
  const stored = formatMeasureStorageNumber(parsed)
  return {
    ok: true,
    next: { ...record, value: stored },
    displayText: formatMeasureEditNumber(stored),
  }
}