import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import { notifyObjectLandImmediate } from './object-nav-signal'

/** Debounced object prefetch timing for keyboard table navigation (arrow rows). */
export function createObjectTableNavDebounce(debounceMs = OBJECT_NAV_DEBOUNCE_MS) {
  let timer: ReturnType<typeof setTimeout> | null = null
  let batchCount = 0
  let lastScheduledCount = 0

  const land = (rowId: string, index: number, prefetchAt: (index: number) => string[]) => {
    notifyObjectLandImmediate(rowId)
    const scheduled = prefetchAt(index)
    batchCount += 1
    lastScheduledCount = scheduled.length
    return scheduled
  }

  return {
    debouncedLand(rowId: string, index: number, prefetchAt: (index: number) => string[]) {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        land(rowId, index, prefetchAt)
      }, debounceMs)
    },
    immediateLand(rowId: string, index: number, prefetchAt: (index: number) => string[]) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      return land(rowId, index, prefetchAt)
    },
    clear() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },
    get batchCount() {
      return batchCount
    },
    get lastScheduledCount() {
      return lastScheduledCount
    },
  }
}

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