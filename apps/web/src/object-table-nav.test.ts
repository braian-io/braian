// @vitest-environment jsdom
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_NAV_DEBOUNCE_MS, OBJECT_PREFETCH_RADIUS } from './object-list-preview'
import { createObjectTableNavDebounce } from './object-table-nav'

describe('table object-nav prefetch debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const prefetchAt = (index: number) => {
    const ids: string[] = []
    for (let cursor = index - OBJECT_PREFETCH_RADIUS; cursor <= index + OBJECT_PREFETCH_RADIUS; cursor += 1) {
      if (cursor >= 0) ids.push(`obj-${cursor}`)
    }
    return ids
  }

  it('coalesces twenty-four arrow steps at 50ms into one prefetch batch', () => {
    const nav = createObjectTableNavDebounce(OBJECT_NAV_DEBOUNCE_MS)
    for (let step = 0; step < 24; step += 1) {
      nav.debouncedLand(`row-${step}`, step, prefetchAt)
      act(() => vi.advanceTimersByTime(50))
    }
    act(() => vi.advanceTimersByTime(OBJECT_NAV_DEBOUNCE_MS))
    expect(nav.batchCount).toBe(1)
    expect(nav.lastScheduledCount).toBeLessThanOrEqual(OBJECT_PREFETCH_RADIUS * 2 + 1)
  })

  it('prefetches on every arrow when steps are slower than debounce', () => {
    const nav = createObjectTableNavDebounce(OBJECT_NAV_DEBOUNCE_MS)
    for (let step = 0; step < 24; step += 1) {
      nav.debouncedLand(`row-${step}`, step, prefetchAt)
      act(() => vi.advanceTimersByTime(150))
    }
    expect(nav.batchCount).toBe(24)
  })
})