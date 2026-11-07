import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api, type Json } from './api'
import { indexProposalCells, type IndexedProposalCell } from './review-cells'

/** Open object proposals, shared by the table and Detail. Import drafts stay on the import view. */
export function useOpenObjectProposals(): {
  byObject: Map<string, IndexedProposalCell[]>
  ready: boolean
} {
  const list = useQuery({
    queryKey: ['proposals', 'open-review'],
    queryFn: () => api.get('/v1/proposals', { params: { query: { status: 'open', limit: 200 } } }),
  })
  const ids = (((list.data?.proposals as Json[] | undefined) ?? [])
    .filter((item) => String(item.status ?? '') === 'open' && !item.session_id)
    .map((item) => String(item.id))
    .filter((id, index, all) => id && all.indexOf(id) === index))
  const bodies = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['proposal', id],
      queryFn: () => api.get('/v1/proposals/{id}', { params: { path: { id } } }),
    })),
  })
  const byObject = useMemo(
    () => indexProposalCells(bodies.flatMap((result) => (result.data ? [result.data as Json] : []))),
    [bodies],
  )
  return { byObject, ready: !list.isPending }
}
