import { chooseModelSelection } from './model-selection'

/** Open the Object types table on a type. Queued until the table is mounted. */
export const OPEN_MODEL_TYPE = 'braian-open-model-type'

let pending = ''

export function requestOpenModelType(typeKey: string) {
  if (!typeKey) return
  pending = typeKey
  chooseModelSelection({ kind: 'type', typeKey })
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_MODEL_TYPE, { detail: { key: typeKey } }))
}

/** The table keeps the queued key until it has selected a row, so a remount cannot lose it. */
export function peekPendingModelType() {
  return pending
}

export function clearPendingModelType(key?: string) {
  if (!key || pending === key) pending = ''
}
