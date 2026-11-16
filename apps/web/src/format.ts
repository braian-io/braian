/** YYYY-MM-DD HH:mm in the browser's time zone. Digits only, 24-hour. */
export function formatTimestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : '')
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Display unit code with conventional casing (kJ, kcal, g, …). */
export function formatUnitCode(unit: string): string {
  const trimmed = unit.trim()
  if (!trimmed) return ''
  if (trimmed.toLowerCase() === 'kj') return 'kJ'
  return trimmed
}

/** Rounded measure for display after unit conversion (at most 2 decimals, trailing zeros trimmed). */
export function formatConvertedNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  const rounded = Math.round(value * 100) / 100
  return new Intl.NumberFormat('en', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(rounded)
}

/**
 * Parse a human-entered decimal (`1,5`, `1.5`, `1,234.5` with grouping).
 * Returns null for empty or non-numeric text.
 */
/** Thousands: ASCII space, NBSP, narrow NBSP. Commas are always decimal when alone. */
const GROUPING_SPACE = /[\s\u00A0\u202F]/g

export function parseDecimalInput(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  let normalized = trimmed.replace(GROUPING_SPACE, '')
  const lastComma = normalized.lastIndexOf(',')
  const lastDot = normalized.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // When both appear, the rightmost separator is the decimal mark.
    if (lastComma > lastDot) {
      normalized = normalized.replaceAll('.', '').replace(',', '.')
    } else {
      normalized = normalized.replaceAll(',', '')
    }
  } else if (lastComma >= 0) {
    if ((normalized.match(/,/g) ?? []).length > 1) return null
    normalized = normalized.replace(',', '.')
  } else if (lastDot >= 0 && (normalized.match(/\./g) ?? []).length > 1) {
    const head = normalized.slice(0, lastDot).replaceAll('.', '')
    normalized = `${head}${normalized.slice(lastDot)}`
  }
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Decimal string for API storage without float noise or locale grouping. */
export function formatMeasureStorageNumber(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return rounded.toFixed(6).replace(/\.?0+$/, '')
}

/** Format a stored or indexed measure number for display (no unit suffix). */
export function formatMeasureNumber(value: unknown): string {
  if (value == null || value === '') return ''
  const numeric = typeof value === 'number' ? value : parseDecimalInput(String(value))
  if (numeric == null) return String(value)
  return formatConvertedNumber(numeric)
}

/** Editable measure inputs: no thousands grouping (avoids 2,000 parsing as 2). */
export function formatMeasureEditNumber(value: unknown): string {
  if (value == null || value === '') return ''
  const numeric = typeof value === 'number' ? value : parseDecimalInput(String(value))
  if (numeric == null || !Number.isFinite(numeric)) return String(value).trim()
  return formatMeasureStorageNumber(numeric)
}

/** Number plus unit for a converted measure cell. */
export function formatConvertedMeasure(value: number, unit: string): string {
  const label = formatUnitCode(unit)
  const shown = formatConvertedNumber(value)
  return label ? `${shown} ${label}` : shown
}

/** A number, and its unit when one was entered. Digits follow the `en` locale. */
export function formatMeasure(value: string, unit?: string): string {
  const trimmed = value.trim()
  const parsed = parseDecimalInput(trimmed)
  const shown = parsed != null ? formatConvertedNumber(parsed) : trimmed
  const unitLabel = unit ? formatUnitCode(unit) : ''
  return unitLabel ? `${shown} ${unitLabel}` : shown
}

/** Grouped the same way in every browser locale. */
export function formatCount(value: unknown): string {
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(count)) return '0'
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(count)
}
