import type { Json } from './api'
import { formatTimestamp } from './format'

/** Local HH:mm from an API timestamp, reusing the UI's timestamp formatting. */
function clock(value: unknown): string {
  const match = / (\d{2}:\d{2})$/.exec(formatTimestamp(value))
  return match ? match[1] : ''
}

/** One human sentence for the Review workspace batch log. */
export function formatBatchLogLine(row: Json): string {
  const actor = typeof row.actor === 'string' && row.actor.trim() !== '' ? row.actor.trim() : 'Someone'
  const op = typeof row.op === 'string' ? row.op.trim() : ''
  const diff = row.diff
  const count = diff !== null && typeof diff === 'object' && !Array.isArray(diff) ? Object.keys(diff).length : 0

  const parts = [`${actor} updated`]
  if (count > 0) parts.push(String(count))
  if (op) parts.push(op)

  const time = clock(row.at)
  const line = time ? `${parts.join(' ')} · ${time}` : parts.join(' ')
  const via = row.on_behalf_of && typeof row.via === 'string' && row.via.trim() !== '' ? ` via ${row.via.trim()}` : ''
  return `${line}${via}`
}
