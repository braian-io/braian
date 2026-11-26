// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_FETCH_STALE_MS } from './object-gone'
import { OBJECT_NAV_DEBOUNCE_MS, OBJECT_PREFETCH_RADIUS, prefetchObjectDetails } from './object-list-preview'
import { notifyObjectLandImmediate } from './object-nav-signal'
import { useObjectLand } from './use-object-land'

afterEach(cleanup)

describe('object navigation fetch budget', () => {
  it('prefetches only the landed row and its neighbors', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const spy = vi.spyOn(client, 'prefetchQuery').mockResolvedValue(undefined as never)
    const landedIndex = 19
    const window: string[] = []
    for (let cursor = landedIndex - OBJECT_PREFETCH_RADIUS; cursor <= landedIndex + OBJECT_PREFETCH_RADIUS; cursor += 1) {
      window.push(`obj-${cursor}`)
    }
    const scheduled = prefetchObjectDetails(client, window)
    expect(scheduled).toHaveLength(OBJECT_PREFETCH_RADIUS * 2 + 1)
    expect(scheduled).toContain(`obj-${landedIndex}`)
    expect(spy.mock.calls[0]?.[0]?.staleTime).toBe(OBJECT_FETCH_STALE_MS)
    spy.mockRestore()
  })

  it('fires one landed fetch after twenty rapid arrow ids, not one per step', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ id }) => useObjectLand(id), {
      initialProps: { id: 'obj-0' as string | null },
    })
    for (let step = 1; step < 20; step += 1) {
      rerender({ id: `obj-${step}` })
    }
    act(() => vi.advanceTimersByTime(OBJECT_NAV_DEBOUNCE_MS))
    act(() => notifyObjectLandImmediate('obj-19'))
    expect(result.current.landedId).toBe('obj-19')
    expect(result.current.settled).toBe(true)
    vi.useRealTimers()
  })
})