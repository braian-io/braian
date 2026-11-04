import { toast } from 'sonner'
import { ApiError } from './api/client'

export type QuietWrite = {
  /** Status codes the caller already handled, typically an expected 404. */
  ignoreStatus?: readonly number[]
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Human text from a problem+json body. Empty when the body has none. */
export function messageFromErrorBody(body: unknown): string {
  if (!body || typeof body !== 'object') return ''
  const record = body as Record<string, unknown>
  const detail = textOf(record.detail)
  if (detail) return detail
  const nested = record.error
  if (nested && typeof nested === 'object') {
    const inner = messageFromErrorBody(nested)
    if (inner) return inner
    const message = textOf((nested as Record<string, unknown>).message)
    if (message) return message
  }
  const message = textOf(record.message)
  if (message) return message
  const errors = record.errors
  if (Array.isArray(errors)) {
    for (const item of errors) {
      if (typeof item === 'string' && item.trim()) return item.trim()
      if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>
        const line = textOf(row.message) || textOf(row.detail)
        if (line) return line
      }
    }
  }
  const definitions = record.definition_errors
  if (Array.isArray(definitions)) {
    const line = definitions.find((item) => typeof item === 'string' && item.trim())
    if (typeof line === 'string') return line.trim()
  }
  return ''
}

/**
 * Server message, else the status text stored on `ApiError`.
 * Null for an aborted request or a status the caller already handled.
 */
export function writeErrorMessage(error: unknown, quiet?: QuietWrite): string | null {
  if (isAbortError(error)) return null
  if (error instanceof ApiError) {
    if (quiet?.ignoreStatus?.includes(error.status)) return null
    const fromBody = messageFromErrorBody(error.body)
    if (fromBody) return fromBody
    const statusText = error.message.trim()
    if (statusText) return statusText
    return error.status ? `HTTP ${error.status}` : 'The write failed'
  }
  if (error instanceof Error) {
    const message = error.message.trim()
    return message || 'The write failed'
  }
  return 'The write failed'
}

/** Toast the server message. Returns the text, or null when nothing was shown. */
export function reportWriteError(error: unknown, quiet?: QuietWrite): string | null {
  const message = writeErrorMessage(error, quiet)
  if (!message) return null
  toast.error(message)
  return message
}
