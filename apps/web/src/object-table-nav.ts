import { notifyObjectLandImmediate } from './object-nav-signal'

export type ObjectTableNavTimerRef = { current: ReturnType<typeof setTimeout> | null }

export function scheduleDebouncedTableNavLand(
  timerRef: ObjectTableNavTimerRef,
  debounceMs: number,
  rowId: string,
  onLand: () => void,
) {
  if (timerRef.current) clearTimeout(timerRef.current)
  timerRef.current = setTimeout(() => {
    timerRef.current = null
    notifyObjectLandImmediate(rowId)
    onLand()
  }, debounceMs)
}

export function commitImmediateTableNavLand(timerRef: ObjectTableNavTimerRef, rowId: string, onLand: () => void) {
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
  notifyObjectLandImmediate(rowId)
  onLand()
}
