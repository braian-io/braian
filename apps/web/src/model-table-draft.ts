import { chooseModelSelection } from './model-selection'
import type { ModelSelection } from './model-view'

export type ModelTableDraftHandle = {
  dirty: () => boolean
  discard: () => void
  review: () => void | Promise<void>
  /** Stage local table edits into the model draft without opening review. */
  flushToDraft?: () => void | Promise<void>
}

type LeaveRequest = {
  action: () => void
}

let active: ModelTableDraftHandle | null = null
let leave: LeaveRequest | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listen of listeners) listen()
}

export function registerModelTableDraft(handle: ModelTableDraftHandle | null) {
  if (handle === null && leave) {
    leave = null
  }
  active = handle
  notify()
}

export function modelTableDraftDirty(): boolean {
  return Boolean(active?.dirty())
}

export function tryModelTableLeave(action: () => void) {
  if (!active?.dirty()) {
    action()
    return
  }
  leave = { action }
  notify()
}

export function subscribeModelTableDraft(listen: () => void) {
  listeners.add(listen)
  return () => {
    listeners.delete(listen)
  }
}

export function modelTableLeaveRequest(): LeaveRequest | null {
  return leave
}

export function cancelModelTableLeave() {
  leave = null
  notify()
}

export function confirmModelTableLeaveDiscard() {
  if (!leave || !active) return
  active.discard()
  const action = leave.action
  leave = null
  notify()
  action()
}

export async function confirmModelTableLeaveReview() {
  if (!leave || !active) return
  const action = leave.action
  await Promise.resolve(active.review())
  if (active?.dirty()) return
  leave = null
  notify()
  action()
}

/** Stage an dirty model table into the shared model draft (Ctrl+S path). */
export async function flushModelTableDraftToStaged(): Promise<boolean> {
  if (!active?.dirty()) return true
  const flush = active.flushToDraft
  if (!flush) {
    await Promise.resolve(active.review())
    return !active?.dirty()
  }
  try {
    await Promise.resolve(flush())
    return !active?.dirty()
  } catch {
    return false
  }
}

export function tryChooseModelSelection(next: ModelSelection) {
  tryModelTableLeave(() => chooseModelSelection(next))
}
