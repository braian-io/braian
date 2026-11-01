export type LiveState = 'connecting' | 'open' | 'message' | 'reconnecting' | 'closed'

export type StatusAction = { label: string; onClick: () => void }

export type StatusMessage = {
  kind: 'offline' | 'error' | 'saving' | 'locked' | 'update'
  text: string
  title?: string
  action?: StatusAction
}

export type StatusUpdateNotice = {
  text: string
  action: StatusAction
}

export type StatusInput = {
  saving: boolean
  online: boolean
  live: LiveState
  saveError: string | null
  locked: boolean
  /** Pending new-deploy notice; lower priority than offline/error/locked/saving. */
  update: StatusUpdateNotice | null
}

/** Connected means: the browser is online and the event stream is not broken. */
export function isConnected(online: boolean, live: LiveState): boolean {
  return online && live !== 'reconnecting' && live !== 'closed'
}

const MAX_ERROR = 60

export function shortError(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > MAX_ERROR ? `${one.slice(0, MAX_ERROR - 1)}…` : one
}

/**
 * Ranked status for the bottom bar.
 * offline > error > locked > saving > update > empty.
 * `update` yields to higher ranks but returns when they clear (never discarded).
 */
export function statusMessage(
  input: StatusInput,
  text: { reconnecting: string; saving: string; saveFailed: string; locked: string },
): StatusMessage | null {
  if (!isConnected(input.online, input.live)) return { kind: 'offline', text: text.reconnecting }
  if (input.saveError) {
    return { kind: 'error', text: `${text.saveFailed}: ${shortError(input.saveError)}`, title: input.saveError }
  }
  if (input.locked) return { kind: 'locked', text: text.locked }
  if (input.saving) return { kind: 'saving', text: text.saving }
  if (input.update) {
    return { kind: 'update', text: input.update.text, action: input.update.action }
  }
  return null
}
