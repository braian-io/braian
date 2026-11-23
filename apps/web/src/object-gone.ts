import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { ApiError } from './api/client'
import { errorCodeFromBody } from './write-error'

/** Soft-deleted objects are gone from reads (410), not validation or graph failures. */
export function objectGone(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 410) return true
  return error.status === 404 && errorCodeFromBody(error.body) === 'deleted'
}

export function objectQueryGone(queryClient: QueryClient, id: string | null | undefined): boolean {
  if (!id) return false
  return objectGone(queryClient.getQueryState(['object', id])?.error)
}

function goneReadError(): ApiError {
  return new ApiError(410, 'deleted', { code: 'deleted', detail: 'deleted' })
}

const OBJECT_READ_QUERY_KEYS = (id: string): QueryKey[] => [
  ['object', id],
  ['graph', id],
  ['history', id],
  ['object-origin', id],
]

/** Pin a deleted id so reads stop refetching and panes show the deleted empty state. */
export function markObjectGone(queryClient: QueryClient, id: string): void {
  const error = goneReadError()
  for (const queryKey of OBJECT_READ_QUERY_KEYS(id)) {
    void queryClient.cancelQueries({ queryKey, exact: true })
    const existing = queryClient.getQueryCache().find({ queryKey, exact: true })
    const query = existing ?? queryClient.getQueryCache().build(queryClient, {
      queryKey,
      queryFn: () => Promise.reject(error) as Promise<never>,
    })
    query.setState({
      data: undefined,
      error,
      status: 'error',
      fetchStatus: 'idle',
    })
  }
}

export function clearObjectGone(queryClient: QueryClient, id: string): void {
  for (const queryKey of OBJECT_READ_QUERY_KEYS(id)) {
    queryClient.removeQueries({ queryKey, exact: true })
  }
}

/** Prefetched neighbors and a landed row stay fresh through fast arrow navigation. */
export const OBJECT_FETCH_STALE_MS = 60_000

/** Bounded retries so a persistent 5xx cannot spin forever on list-preview fetches. */
export const OBJECT_FETCH_MAX_RETRIES = 2

export function objectFetchQueryOptions() {
  return {
    staleTime: OBJECT_FETCH_STALE_MS,
    retry: (count: number, error: Error) => !objectGone(error) && count < OBJECT_FETCH_MAX_RETRIES,
    retryDelay: (attempt: number) => Math.min(1_000 * 2 ** attempt, 8_000),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  }
}