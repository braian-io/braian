// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import { notifyObjectLandImmediate } from './object-nav-signal'
import { useUrlObjectMirror } from './use-url-object-mirror'

afterEach(cleanup)

describe('useUrlObjectMirror', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces token updates until the debounce window or land signal', () => {
    const { result, rerender } = renderHook(({ token }) => useUrlObjectMirror(token), {
      initialProps: { token: 'A' as string | null },
    })
    expect(result.current).toBe('A')

    rerender({ token: 'B' })
    rerender({ token: 'C' })
    expect(result.current).toBe('A')

    act(() => vi.advanceTimersByTime(OBJECT_NAV_DEBOUNCE_MS))
    expect(result.current).toBe('C')

    rerender({ token: 'D' })
    act(() => notifyObjectLandImmediate('id'))
    expect(result.current).toBe('D')
  })

  it('clears the URL object immediately when selection is emptied', () => {
    const { result, rerender } = renderHook(({ token }) => useUrlObjectMirror(token), {
      initialProps: { token: 'A' as string | null },
    })
    rerender({ token: null })
    expect(result.current).toBeNull()
  })
})