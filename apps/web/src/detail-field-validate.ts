import type { Json } from './api'
import { copy } from './i18n'

type Kind = {
  type?: string
  max_length?: number
  integer?: boolean
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function asRecord(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
}

function emptyScalar(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function numberText(value: unknown): string {
  if (typeof value === 'number') return String(value)
  return String(value ?? '').trim().replace(',', '.')
}

function validateScalar(
  value: unknown,
  input: { required?: boolean; kind?: Kind; options?: string[] },
): string {
  const kind = input.kind?.type ?? 'text'
  if (kind === 'number' && value && typeof value === 'object' && !Array.isArray(value)) {
    return validateScalar((value as Json).value, input)
  }
  if (kind === 'range' && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Json
    for (const side of ['min', 'max'] as const) {
      const raw = record[side]
      if (raw == null || String(raw).trim() === '') continue
      if (!Number.isFinite(Number(numberText(raw)))) return copy.fieldInvalidNumber
    }
    return ''
  }
  if (input.required && emptyScalar(value)) return copy.required
  if (emptyScalar(value)) return ''
  if (kind === 'text') {
    if (typeof value !== 'string') return copy.fieldInvalid
    const max = input.kind?.max_length
    if (max != null && [...value].length > max) return copy.fieldTooLong.replaceAll('{max}', String(max))
    return ''
  }
  if (kind === 'number') {
    const parsed = Number(numberText(value))
    if (!Number.isFinite(parsed)) return copy.fieldInvalidNumber
    if (input.kind?.integer && !Number.isInteger(parsed)) return copy.fieldWholeNumber
    return ''
  }
  if (kind === 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return copy.fieldDate
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
    if (
      date.getUTCFullYear() !== year
      || date.getUTCMonth() !== (month ?? 1) - 1
      || date.getUTCDate() !== day
    ) return copy.fieldDate
    return ''
  }
  if (kind === 'value_list') {
    if (typeof value !== 'string') return copy.fieldChoice
    if (input.options && input.options.length > 0 && !input.options.includes(value)) return copy.fieldChoice
    return ''
  }
  if (kind === 'boolean' && typeof value !== 'boolean') return copy.fieldInvalid
  return ''
}

/** Client check before a Detail field is written. An unchanged value is valid. */
export function validateDetailField(input: {
  required?: boolean
  kind?: Kind
  multiple?: boolean
  languageDependent?: boolean
  options?: string[]
  previous: unknown
  next: unknown
}): string {
  if (sameJson(input.previous, input.next)) return ''
  if (input.languageDependent) {
    const before = asRecord(input.previous)
    const after = asRecord(input.next)
    for (const language of Object.keys(after)) {
      if (sameJson(before[language], after[language])) continue
      const message = validateScalar(after[language], input)
      if (message) return message
    }
    return ''
  }
  if (input.multiple && Array.isArray(input.next)) {
    if (input.required && input.next.length === 0) return copy.required
    for (const item of input.next) {
      const message = validateScalar(item, input)
      if (message) return message
    }
    return ''
  }
  return validateScalar(input.next, input)
}
