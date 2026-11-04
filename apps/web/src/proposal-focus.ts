import { useCallback, useEffect, useRef } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { api, type Json } from './api'
import { proposedValues, suggestionLines, valuesFromKept, type DiffLine } from './field-diff'
import { onProposal } from './proposal-bus'
import { reportWriteError } from './write-error'

export type ProposalFocusSession = {
  proposalId: string | null
  setObjectId: (value: string | null) => void
  setProposalId: (value: string | null) => void
}

export type PendingAccept = {
  rows: string[]
  patches: Record<string, Json>
}

function isObjectRow(row: Json): boolean {
  const typeKey = String(row.type_key ?? '')
  return typeKey !== 'model' && typeKey !== 'assortment' && Boolean(row.object_id)
}

/** The single object a proposal edits, or null when it touches none or several. */
export function proposalObjectId(body: Json | undefined): string | null {
  const rows = (body?.rows as Json[] | undefined) ?? []
  const ids = new Set(rows.filter(isObjectRow).map((row) => String(row.object_id)))
  return ids.size === 1 ? [...ids][0]! : null
}

/** Pending rows in a proposal that edit one object. */
export function pendingRowsForObject(body: Json | undefined, objectId: string | null): Json[] {
  if (!body || !objectId) return []
  const rows = (body?.rows as Json[] | undefined) ?? []
  return rows.filter(
    (row) => isObjectRow(row) && String(row.object_id) === objectId && String(row.status ?? '') === 'pending',
  )
}

export function pendingLines(row: Json, current: Json, defs: Json | undefined): DiffLine[] {
  return suggestionLines(current, row.patch, defs)
}

/** Accept one proposed line by keeping only that line's value in the row patch. */
export function acceptPendingLine(
  line: DiffLine,
  row: Json,
  lines: DiffLine[],
  current: Json,
): PendingAccept {
  const id = String(row.id ?? '')
  const values = valuesFromKept(current, proposedValues(row.patch), lines, [line])
  return { rows: [id], patches: { [id]: { values } } }
}

/** Reject a pending row. An empty `values` object is the accept endpoint's reject form. */
export function rejectPendingRow(row: Json): PendingAccept {
  const id = String(row.id ?? '')
  return { rows: [id], patches: { [id]: { values: {} } } }
}

/**
 * Open the Detail of the one object a published proposal edits.
 *
 * The palette publishes agent proposals on the bus. Older palette paths only
 * set `session.proposalId`, so an agent proposal with one object is also picked
 * up from there (without reopening proposals a person selects for review).
 */
export function useProposalFocus(
  session: ProposalFocusSession,
  openDetail: () => void,
  queryClient?: QueryClient,
) {
  const sessionRef = useRef(session)
  sessionRef.current = session
  const openRef = useRef(openDetail)
  openRef.current = openDetail
  const focused = useRef(new Set<string>())
  const checking = useRef(new Set<string>())

  const focus = useCallback(async (id: string, agentOnly: boolean) => {
    if (!id || focused.current.has(id)) return
    try {
      const body = (await api.get('/v1/proposals/{id}', { params: { path: { id } } })) as Json
      if (agentOnly && String(body?.source ?? '') !== 'agent') return
      const objectId = proposalObjectId(body)
      if (!objectId || focused.current.has(id)) return
      focused.current.add(id)
      queryClient?.setQueryData(['proposal', id], body)
      sessionRef.current.setProposalId(id)
      sessionRef.current.setObjectId(objectId)
      openRef.current()
    } catch (reason) {
      reportWriteError(reason)
    }
  }, [queryClient])

  useEffect(() => onProposal(({ id }) => {
    void focus(id, false)
  }), [focus])

  useEffect(() => {
    const id = session.proposalId
    if (!id || focused.current.has(id) || checking.current.has(id)) return
    checking.current.add(id)
    void focus(id, true).finally(() => checking.current.delete(id))
  }, [session.proposalId, focus])
}
