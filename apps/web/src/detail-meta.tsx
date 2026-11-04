import type { Json } from './api'
import { copy } from './i18n'

const timeOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  numberingSystem: 'latn',
}

function timePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes, width: number) {
  return (parts.find((part) => part.type === type)?.value ?? '').padStart(width, '0')
}

/** `YYYY-MM-DD HH:mm` in the browser time zone. `timeZone` is for tests. */
export function formatMetaTime(iso: string, timeZone?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en', timeZone ? { ...timeOptions, timeZone } : timeOptions).formatToParts(date)
  const year = timePart(parts, 'year', 4)
  const month = timePart(parts, 'month', 2)
  const day = timePart(parts, 'day', 2)
  const hour = timePart(parts, 'hour', 2)
  const minute = timePart(parts, 'minute', 2)
  return `${year}-${month}-${day} ${hour}:${minute}`
}

/** Display name of the principal who last wrote the object. */
export function principalName(updatedBy: unknown): string {
  if (!updatedBy || typeof updatedBy !== 'object') return ''
  const name = (updatedBy as Json).name
  return name == null ? '' : String(name)
}

export function metaLine({
  createdAt,
  updatedAt,
  updatedBy,
  timeZone,
}: {
  createdAt?: string
  updatedAt?: string
  updatedBy?: unknown
  timeZone?: string
}): string {
  const parts: string[] = []
  const created = formatMetaTime(createdAt ?? '', timeZone)
  if (created) parts.push(`${copy.created} ${created}`)
  const updated = formatMetaTime(updatedAt ?? '', timeZone)
  if (updated) {
    const by = principalName(updatedBy)
    parts.push(`${copy.updated} ${updated}${by ? ` ${copy.by} ${by}` : ''}`)
  }
  return parts.join(' · ')
}

export function DetailMeta({
  createdAt,
  updatedAt,
  updatedBy,
  timeZone,
}: {
  createdAt?: string
  updatedAt?: string
  updatedBy?: unknown
  timeZone?: string
}) {
  const text = metaLine({ createdAt, updatedAt, updatedBy, timeZone })
  if (!text) return null
  return (
    <p className="detail-meta" data-testid="object-meta">
      {text}
    </p>
  )
}
