import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'

declare global {
  interface Window {
    /** Playwright initScript only: disable table object-nav debounce for e2e budgets. */
    __BRAIAN_DISABLE_OBJECT_NAV_DEBOUNCE__?: boolean
    /** Playwright initScript only: sum prefetchObjectDetails schedules per object-nav burst. */
    __BRAIAN_TRACK_OBJECT_NAV_PREFETCH__?: boolean
    __BRAIAN_NAV_PREFETCH_BATCHES__?: number
    __BRAIAN_NAV_PREFETCH_SCHEDULED__?: number
  }
}

export function objectNavDebounceMs() {
  if (typeof window !== 'undefined' && window.__BRAIAN_DISABLE_OBJECT_NAV_DEBOUNCE__) return 0
  return OBJECT_NAV_DEBOUNCE_MS
}