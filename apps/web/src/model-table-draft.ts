import { chooseModelSelection } from './model-selection'
import type { ModelSelection } from './model-view'

export type ModelTableDraftHandle = {
  dirty: () => boolean
  discard: () => void
  review: () => void | Promise<void>
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
  active = handle
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

export function tryChooseModelSelection(next: ModelSelection) {
  if (!active?.dirty()) {
    chooseModelSelection(next)
    return
  }
  leave = { action: () => chooseModelSelection(next) }
  notify()
}