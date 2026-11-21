// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OBJECT_NAV_DEBOUNCE_MS } from './object-list-preview'
import { markObjectNavReplace, notifyObjectLandImmediate, resetObjectNavReplace } from './object-nav-signal'
import { useUrlObjectMirror } from './use-url-object-mirror'

afterEach(() => {
  cleanup()
  resetObjectNavReplace()
})

describe('useUrlObjectMirror', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces token updates during arrow replace bursts', () => {
    const { result, rerender } = renderHook(({ token }) => useUrlObjectMirror(token), {
      initialProps: { token: 'A' as string | null },
    })
    markObjectNavReplace('row-1')
    rerender({ token: 'B' })
    rerender({ token: 'C' })
    expect(result.current).toBe('A')

    act(() => vi.advanceTimersByTime(OBJECT_NAV_DEBOUNCE_MS))
    expect(result.current).toBe('C')

    markObjectNavReplace('row-2')
    rerender({ token: 'D' })
    act(() => notifyObjectLandImmediate('id'))
    expect(result.current).toBe('D')
  })

  it('mirrors immediately without an arrow replace mark', () => {
    const { result, rerender } = renderHook(({ token }) => useUrlObjectMirror(token), {
      initialProps: { token: 'A' as string | null },
    })
    rerender({ token: 'B' })
    expect(result.current).toBe('B')
  })

  it('clears the URL object immediately when selection is emptied', () => {
    const { result, rerender } = renderHook(({ token }) => useUrlObjectMirror(token), {
      initialProps: { token: 'A' as string | null },
    })
    rerender({ token: null })
    expect(result.current).toBeNull()
  })

  it('flushes immediately on popstate', () => {
    markObjectNavReplace('row-1')
    const { result, rerender } = renderHook(({ token }) => useUrlObjectMirror(token), {
      initialProps: { token: 'A' as string | null },
    })
    rerender({ token: 'B' })
    expect(result.current).toBe('A')
    act(() => window.dispatchEvent(new PopStateEvent('popstate')))
    expect(result.current).toBe('B')
  })
})