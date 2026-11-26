import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ApiError } from './api/client'
import {
  clearObjectGone,
  markObjectGone,
  OBJECT_FETCH_MAX_RETRIES,
  OBJECT_FETCH_STALE_MS,
  objectFetchQueryOptions,
  objectGone,
  objectQueryGone,
} from './object-gone'

describe('objectGone', () => {
  it('treats 410 and deleted 404 as gone', () => {
    expect(objectGone(new ApiError(410, 'deleted', { code: 'deleted' }))).toBe(true)
    expect(objectGone(new ApiError(404, 'not found', { code: 'deleted' }))).toBe(true)
    expect(objectGone(new ApiError(404, 'not found', { code: 'not_found' }))).toBe(false)
    expect(objectGone(new ApiError(422, 'bad', {}))).toBe(false)
  })
})

describe('objectFetchQueryOptions', () => {
  it('keeps prefetched object reads warm through fast table arrows', () => {
    expect(objectFetchQueryOptions().staleTime).toBe(OBJECT_FETCH_STALE_MS)
  })

  it('retries transient read failures a bounded number of times', () => {
    const { retry, retryDelay } = objectFetchQueryOptions()
    const error = new Error('server error')
    expect(retry?.(0, error)).toBe(true)
    expect(retry?.(OBJECT_FETCH_MAX_RETRIES - 1, error)).toBe(true)
    expect(retry?.(OBJECT_FETCH_MAX_RETRIES, error)).toBe(false)
    expect(retryDelay?.(0)).toBe(1_000)
    expect(retryDelay?.(1)).toBe(2_000)
  })
})

describe('markObjectGone', () => {
  it('pins an error on object reads and stops retry', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    markObjectGone(client, 'obj-gone')
    expect(objectQueryGone(client, 'obj-gone')).toBe(true)
    const state = client.getQueryState(['object', 'obj-gone'])
    expect(state?.status).toBe('error')
    expect(objectGone(state?.error)).toBe(true)
    const error = state?.error ?? new Error('missing')
    expect(objectFetchQueryOptions().retry(1, error)).toBe(false)
    clearObjectGone(client, 'obj-gone')
    expect(objectQueryGone(client, 'obj-gone')).toBe(false)
  })
})