import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BULK_MAX_MS,
  BULK_QUIET_MS,
  INTERACTIVE_LIST_MS,
  SearchRefresh,
  classifyLive,
  liveRestoresObject,
} from './live-refresh'
import { markObjectGone, objectQueryGone } from './object-gone'

afterEach(() => {
  vi.useRealTimers()
})

describe('live search refresh', () => {
  it('classifies interactive edits and bulk summaries', () => {
    expect(classifyLive(JSON.stringify({ op: 'update', object_id: '1' }))).toBe('interactive')
    expect(classifyLive(JSON.stringify({ op: 'bulk_summary', count: 200 }))).toBe('bulk')
    expect(classifyLive(JSON.stringify({ op: 'job', status: 'running' }))).toBe('ignore')
  })

  it('treats interactive updates as restoring a soft-deleted object', () => {
    expect(liveRestoresObject(JSON.stringify({ op: 'update', object_id: '1' }))).toBe(true)
    expect(liveRestoresObject(JSON.stringify({ op: 'patch', object_id: '1' }))).toBe(true)
    expect(liveRestoresObject(JSON.stringify({ op: 'delete', object_id: '1' }))).toBe(false)
  })

  it('clears a gone pin when a restore event arrives on the live stream', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    markObjectGone(client, 'obj-restore')
    const refresh = new SearchRefresh(() => {}, () => {}, client)
    refresh.onEvent(JSON.stringify({ op: 'update', object_id: 'obj-restore' }))
    expect(objectQueryGone(client, 'obj-restore')).toBe(false)
    refresh.dispose()
  })

  it('refreshes one object immediately and the list once after a burst of edits', () => {
    vi.useFakeTimers()
    const lists: number[] = []
    const objects: string[] = []
    const refresh = new SearchRefresh(
      () => lists.push(1),
      (id) => objects.push(id),
    )
    refresh.onEvent(JSON.stringify({ op: 'update', object_id: 'a' }))
    refresh.onEvent(JSON.stringify({ op: 'update', object_id: 'b' }))
    expect(objects).toEqual(['a', 'b'])
    expect(lists).toEqual([])
    vi.advanceTimersByTime(INTERACTIVE_LIST_MS - 1)
    expect(lists).toEqual([])
    vi.advanceTimersByTime(1)
    expect(lists).toEqual([1])
    refresh.dispose()
  })

  it('does not search on every bulk summary', () => {
    vi.useFakeTimers()
    const lists: number[] = []
    const objects: string[] = []
    const refresh = new SearchRefresh(
      () => lists.push(1),
      (id) => objects.push(id),
    )
    const start = Date.now()
    for (let step = 0; step < 10; step += 1) {
      vi.setSystemTime(start + step * 200)
      refresh.onEvent(JSON.stringify({ op: 'bulk_summary', count: 200 }), start + step * 200)
    }
    expect(objects).toEqual([])
    expect(lists).toEqual([])
    vi.advanceTimersByTime(BULK_QUIET_MS)
    expect(lists).toEqual([1])
    refresh.dispose()
  })

  it('refreshes a long bulk at the cap instead of waiting for quiet', () => {
    vi.useFakeTimers()
    const lists: number[] = []
    const refresh = new SearchRefresh(
      () => lists.push(1),
      () => {},
    )
    const start = 1_000
    refresh.onEvent(JSON.stringify({ op: 'bulk' }), start)
    refresh.onEvent(JSON.stringify({ op: 'bulk_summary', count: 1 }), start + BULK_MAX_MS)
    vi.advanceTimersByTime(0)
    expect(lists).toEqual([1])
    refresh.dispose()
  })
})
