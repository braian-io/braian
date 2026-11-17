// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import { notifyObjectLandImmediate } from './object-nav-signal'
import { useObjectLand } from './use-object-land'

afterEach(cleanup)

describe('useObjectLand', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces the landed id across rapid arrow steps', () => {
    const { result, rerender } = renderHook(({ id }) => useObjectLand(id), { initialProps: { id: 'a' as string | null } })
    expect(result.current.settled).toBe(true)
    rerender({ id: 'b' })
    expect(result.current.settled).toBe(false)
    rerender({ id: 'c' })
    act(() => vi.advanceTimersByTime(OBJECT_NAV_DEBOUNCE_MS - 1))
    expect(result.current.settled).toBe(false)
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.settled).toBe(true)
    expect(result.current.landedId).toBe('c')
  })

  it('flushes immediately when the table commits a landed row', () => {
    const { result, rerender } = renderHook(({ id }) => useObjectLand(id), { initialProps: { id: 'a' as string | null } })
    act(() => notifyObjectLandImmediate('b'))
    expect(result.current.landedId).toBe('b')
    expect(result.current.settled).toBe(false)
    rerender({ id: 'b' })
    expect(result.current.settled).toBe(true)
  })
})