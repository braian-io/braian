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

/** Number plus unit for a converted measure cell. */
export function formatConvertedMeasure(value: number, unit: string): string {
  const label = formatUnitCode(unit)
  const shown = formatConvertedNumber(value)
  return label ? `${shown} ${label}` : shown
}

/** A number, and its unit when one was entered. Digits follow the `en` locale. */
export function formatMeasure(value: string, unit?: string): string {
  const trimmed = value.trim()
  const numeric = Number(trimmed.replaceAll(',', ''))
  const shown = trimmed !== '' && Number.isFinite(numeric)
    ? new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(numeric)
    : trimmed
  return unit ? `${shown} ${unit}` : shown
}

/** Grouped the same way in every browser locale. */
export function formatCount(value: unknown): string {
  const count = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(count)) return '0'
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(count)
}
