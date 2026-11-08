import { api, failureLines, freeObject, type Json } from './api'
import { proposeInAgentSession } from './agent-runs'
import { applyObjectWrite } from './object-write'
import {
  discardSubmittedCells,
  draftBaseVersion,
  draftValues,
  noteObjectDraftSaved,
  objectDraftCells,
  objectDraftSnapshot,
  reviewCapabilities,
  type DraftPrincipal,
  type ObjectDraftCell,
} from './object-draft'
import type { IndexedProposalCell, ProposalMembership } from './review-cells'
import type { QueryClient } from '@tanstack/react-query'

export type DraftSaveItem =
  | { kind: 'patch'; objectId: string; version: number; values: Json; texts: Record<string, string>; cells: ObjectDraftCell[] }
  | { kind: 'propose'; objectId: string; objectKey: string; typeKey: string; version: number; values: Json; cells: ObjectDraftCell[] }
  | { kind: 'accept'; proposalId: string; rowIds: string[] }
  | { kind: 'blocked'; reason: string }

export function draftSavePlan(input: {
  objectIds: string[]
  serverVersions: Record<string, number>
  principal: DraftPrincipal
  /** A person editing while an agent session is on screen files a proposal instead of writing. */
  fileAsProposal: boolean
  roleCanWrite: boolean
  validationErrors?: string[]
  proposals?: IndexedProposalCell[]
  meta?: Record<string, { key: string; type: string }>
  /** The rows the person is reviewing. Anything outside it is not saved. */
  scope?: string[]
}): DraftSaveItem[] {
  const items: DraftSaveItem[] = []
  const inScope = (objectId: string) => !input.scope || input.scope.includes(objectId)
  const proposals = (input.proposals ?? []).filter((cell) => inScope(cell.objectId))
  // A local draft wins over a pending proposal on the same object. Saving it
  // bumps the object version, which makes that proposal stale instead of
  // overwriting anything. Proposals on other reviewed rows are still accepted.
  const writtenObjects = new Set<string>()
  for (const objectId of input.objectIds) {
    if (!inScope(objectId)) continue
    const cells = objectDraftCells(objectId)
    if (cells.length === 0) continue
    const base = draftBaseVersion(objectId) ?? input.serverVersions[objectId] ?? 0
    const server = input.serverVersions[objectId]
    const stale = server != null && server !== base
    const capability = reviewCapabilities({
      principal: input.principal,
      viaAgent: false,
      open: true,
      stale,
      conflict: false,
      validationErrors: input.validationErrors ?? [],
      roleCanWrite: input.roleCanWrite,
    })
    if (!capability.canSave) {
      items.push({ kind: 'blocked', reason: capability.saveReason })
      continue
    }
    writtenObjects.add(objectId)
    const values = draftValues(objectId)
    if (input.fileAsProposal) {
      const meta = input.meta?.[objectId]
      items.push({
        kind: 'propose',
        objectId,
        objectKey: meta?.key ?? '',
        typeKey: meta?.type ?? '',
        version: base,
        values,
        cells: cells.map((cell) => ({ ...cell })),
      })
    } else {
      const texts: Record<string, string> = {}
      for (const cell of cells) texts[cell.columnId] = cell.proposedText
      items.push({
        kind: 'patch',
        objectId,
        version: base,
        values,
        texts,
        cells: cells.map((cell) => ({ ...cell })),
      })
    }
  }
  if (items.some((item) => item.kind === 'blocked')) return items
  const candidates = proposals.filter((cell) => !writtenObjects.has(cell.objectId))
  // A stale or conflicted proposal cannot be accepted. Skip it here; it stays
  // visible for Discard. Saving a local draft must not be blocked by it.
  const reviewProposals = candidates.filter((cell) => !cell.stale && !cell.conflict)
  const capability = reviewCapabilities({
    principal: input.principal,
    viaAgent: false,
    open: true,
    stale: false,
    conflict: false,
    validationErrors: input.validationErrors ?? [],
    roleCanWrite: input.roleCanWrite,
  })
  if (!capability.canSave) return [{ kind: 'blocked', reason: capability.saveReason }]
  const byProposal = new Map<string, string[]>()
  for (const cell of reviewProposals) {
    const rows = byProposal.get(cell.proposalId) ?? []
    if (!rows.includes(cell.rowId)) rows.push(cell.rowId)
    byProposal.set(cell.proposalId, rows)
  }
  for (const [proposalId, rowIds] of byProposal) {
    if (proposalId && rowIds.length > 0) items.push({ kind: 'accept', proposalId, rowIds })
  }
  if (items.length === 0) {
    const unusable = candidates.filter((cell) => cell.stale || cell.conflict)
    if (unusable.length > 0) {
      const blocked = reviewCapabilities({
        principal: input.principal,
        viaAgent: false,
        open: true,
        stale: unusable.some((cell) => cell.stale),
        conflict: unusable.some((cell) => cell.conflict),
        validationErrors: input.validationErrors ?? [],
        roleCanWrite: input.roleCanWrite,
      })
      return [{ kind: 'blocked', reason: blocked.saveReason }]
    }
  }
  return items
}

export function draftDiscardPlan(input: {
  objectIds: string[]
  principal: DraftPrincipal
  viaAgent: boolean
  /** The cells the person can actually see right now; proves a proposal was reviewed. */
  proposals?: IndexedProposalCell[]
  /** Complete pending membership per proposal, including objects outside the scope and unmapped rows. */
  membership?: Map<string, ProposalMembership> | ProposalMembership[]
}): { clear: string[]; discard: string[]; reason: string } {
  const capability = reviewCapabilities({
    principal: input.principal,
    viaAgent: input.viaAgent,
    open: true,
    stale: false,
    conflict: false,
    validationErrors: [],
    roleCanWrite: true,
  })
  if (!capability.canDiscard) return { clear: [], discard: [], reason: capability.discardReason }
  const scope = new Set(input.objectIds)
  const clear = input.objectIds.filter((id) => objectDraftCells(id).length > 0)
  const reviewed = new Set(
    (input.proposals ?? []).map((cell) => cell.proposalId).filter(Boolean),
  )
  const membership = Array.isArray(input.membership)
    ? new Map<string, ProposalMembership>(input.membership.map((item) => [item.proposalId, item] as const))
    : input.membership ?? new Map<string, ProposalMembership>()
  // Discard closes the ENTIRE proposal on the server, so a whole-proposal
  // discard needs complete membership, not just the cells this view filtered
  // in. Preserve any proposal that has an unreviewed object or an unmapped
  // create/delete/model row. Without complete membership there is nothing safe
  // to discard.
  const discard: string[] = []
  for (const [proposalId, member] of membership) {
    if (!proposalId || !reviewed.has(proposalId)) continue
    if (member.unmapped) continue
    if (member.objectIds.length === 0) continue
    if (!member.objectIds.every((id) => scope.has(id))) continue
    discard.push(proposalId)
  }
  return { clear, discard, reason: '' }
}

let saving = false

export function objectDraftSaving(): boolean {
  return saving
}

export async function runDraftDiscard(input: {
  objectIds: string[]
  proposals?: IndexedProposalCell[]
  membership?: Map<string, ProposalMembership> | ProposalMembership[]
  principal: DraftPrincipal
  viaAgent: boolean
}): Promise<string> {
  const plan = draftDiscardPlan(input)
  if (plan.reason) return plan.reason
  for (const id of plan.clear) discardSubmittedCells(objectDraftSnapshot([id]))
  for (const id of plan.discard) {
    await api.post('/v1/proposals/{id}/discard', { params: { path: { id } } })
  }
  return ''
}

function reasonOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason || '')
}

function failureReason(result: Json): string {
  const lines = failureLines(result)
  return lines
    .map((line) => String(line.detail ?? line.message ?? line.code ?? ''))
    .filter(Boolean)
    .join('; ')
}

async function refreshProposals(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['proposals'] }),
    queryClient.invalidateQueries({ queryKey: ['proposal'] }),
    queryClient.invalidateQueries({ queryKey: ['objects'] }),
    queryClient.invalidateQueries({ queryKey: ['object'] }),
    queryClient.invalidateQueries({ queryKey: ['path-values'] }),
  ])
}

export async function runDraftSave(
  items: DraftSaveItem[],
  queryClient: QueryClient,
  agentRunId = '',
): Promise<string> {
  if (saving) return ''
  const blocked = items.find((item) => item.kind === 'blocked')
  if (blocked && blocked.kind === 'blocked') return blocked.reason
  saving = true
  const errors: string[] = []
  try {
    for (const item of items) {
      if (item.kind === 'patch') {
        const submitted = item.cells
        try {
          const saved = await api.patch('/v1/objects/{id}', {
            params: { path: { id: item.objectId }, header: { 'If-Match': item.version } },
            body: { values: freeObject(item.values) },
          }) as Json
          const version = Number(saved.version ?? item.version + 1)
          if (!Number.isFinite(version) || version <= item.version) {
            // The server did not acknowledge a newer revision. Keep the draft.
            errors.push('The object was not saved at a newer revision.')
            continue
          }
          noteObjectDraftSaved(item.objectId, version, submitted)
          await applyObjectWrite(queryClient, { ...saved, id: String(saved.id ?? item.objectId) })
        } catch (reason) {
          // Transport, validation, or version error: the submitted cells stay.
          errors.push(reasonOf(reason))
        }
      } else if (item.kind === 'propose') {
        const submitted = item.cells
        try {
          await proposeInAgentSession(agentRunId, {
            objectId: item.objectId,
            objectKey: item.objectKey,
            typeKey: item.typeKey,
            baseVersion: item.version,
            values: item.values,
          })
          discardSubmittedCells(submitted)
          // A filed proposal must appear in the open agent run too.
          if (agentRunId) await queryClient.invalidateQueries({ queryKey: ['agent-run', agentRunId] })
        } catch (reason) {
          errors.push(reasonOf(reason))
        }
      } else if (item.kind === 'accept') {
        try {
          const result = await api.post('/v1/proposals/{id}/accept', {
            params: { path: { id: item.proposalId } },
            body: { rows: item.rowIds },
          }) as Json
          const failed = failureReason(result)
          if (failed) errors.push(failed)
        } catch (reason) {
          errors.push(reasonOf(reason))
        }
      }
    }
    if (items.some((item) => item.kind === 'patch' || item.kind === 'propose' || item.kind === 'accept')) {
      // Patches can make a proposal stale, filed proposals are new, and partial
      // accepts leave pending rows. Refresh the shared review caches once.
      await refreshProposals(queryClient)
    }
    return errors.filter(Boolean).join('; ')
  } finally {
    saving = false
  }
}
