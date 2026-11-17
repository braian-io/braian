import { QueryClient } from '@tanstack/react-query'
import {
  OBJECT_NAV_DEBOUNCE_MS,
  OBJECT_PREFETCH_RADIUS,
  prefetchObjectDetails,
} from './object-list-preview'

/** Mirrors row269 e2e: 24 Down presses; Playwright `delay` is hold time, not gap. */
export const ROW269_RAPID_ARROWS = 24
/** Observed gap between processed ArrowDown keys in CI (~45–55ms). */
export const ROW269_INTER_KEY_MS = 52

/**
 * HTTP GET /v1/objects/* during the rapid-Down burst with debounce on (CI e2e-5, df1795c).
 * Without debounce, the same burst is measured in the e2e budget test below.
 */
export const ROW269_MEASURED_WITH_DEBOUNCE = 48
/** Model + e2e prefetch schedules when object-nav debounce is off (HTTP totals stay ~48; react-query dedupes). */
export const ROW269_PREFETCH_SCHEDULED_WITHOUT_DEBOUNCE_MIN = 27
/** Unit-model prefetch schedules with debounce on (one coalesced burst). */
export const ROW269_PREFETCH_SCHEDULED_WITH_DEBOUNCE = 7
/** Observed `prefetchObjectDetails` schedules with debounce on in CI e2e (c060b46). */
export const ROW269_E2E_PREFETCH_WITH_DEBOUNCE_MAX = 30
/** Upper cap on HTTP GET /v1/objects/* during the rapid-Down burst (debounced nav). */
export const ROW269_GET_BUDGET_MAX = 52

function rowIds(count: number) {
  return Array.from({ length: count }, (_, index) => `obj-${index}`)
}

function prefetchAt(client: QueryClient, rows: string[], index: number) {
  const ids: string[] = []
  for (let cursor = index - OBJECT_PREFETCH_RADIUS; cursor <= index + OBJECT_PREFETCH_RADIUS; cursor += 1) {
    const row = rows[cursor]
    if (row) ids.push(row)
  }
  return prefetchObjectDetails(client, ids).length
}

function countPrefetchGets(client: QueryClient, debounceMs: number, immediatePerArrow: boolean) {
  const rows = rowIds(ROW269_RAPID_ARROWS + OBJECT_PREFETCH_RADIUS + 2)
  let activeIndex = -1
  let pendingLand: number | null = null
  let fireAt = 0
  let now = 0
  let gets = 0

  const flushLand = () => {
    if (pendingLand == null) return
    gets += prefetchAt(client, rows, pendingLand)
    pendingLand = null
  }

  const scheduleLand = (index: number) => {
    if (immediatePerArrow) {
      gets += prefetchAt(client, rows, index)
      return
    }
    pendingLand = index
    fireAt = now + debounceMs
  }

  const tick = (ms: number) => {
    now += ms
    if (!immediatePerArrow && pendingLand != null && now >= fireAt) flushLand()
  }

  for (let step = 0; step < ROW269_RAPID_ARROWS; step += 1) {
    activeIndex += 1
    scheduleLand(activeIndex)
    tick(ROW269_INTER_KEY_MS)
  }
  if (!immediatePerArrow && pendingLand != null) tick(debounceMs)
  return gets
}

/** Count scheduled prefetches for the row269 rapid-arrow scenario (unit model only). */
export function countRow269PrefetchGets(debounceMs: number, immediatePerArrow: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return countPrefetchGets(client, debounceMs, immediatePerArrow)
}