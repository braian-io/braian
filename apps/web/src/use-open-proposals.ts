import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api, type Json } from './api'
import {
  indexProposalCells,
  proposalMemberships,
  unmappedProposals,
  type IndexedProposalCell,
  type ProposalMembership,
  type UnmappedProposal,
} from './review-cells'

/** Open object proposals, shared by the table and Detail. Import drafts stay on the import view. */
export function useOpenObjectProposals(): {
  byObject: Map<string, IndexedProposalCell[]>
  unmapped: UnmappedProposal[]
  membership: Map<string, ProposalMembership>
  ready: boolean
} {
  const list = useQuery({
    queryKey: ['proposals', 'open-review'],
    queryFn: () => api.get('/v1/proposals', { params: { query: { status: 'open', limit: 200 } } }),
    // An agent can file a proposal while a table or Detail is already open.
    // The list is light and the bodies are fetched only for new ids.
    refetchInterval: 5_000,
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
  const loaded = bodies.flatMap((result) => (result.data ? [result.data as Json] : []))
  const byObject = useMemo(() => indexProposalCells(loaded), [bodies])
  const unmapped = useMemo(() => unmappedProposals(loaded), [bodies])
  const membership = useMemo(() => proposalMemberships(loaded), [bodies])
  return { byObject, unmapped, membership, ready: !list.isPending }
}
