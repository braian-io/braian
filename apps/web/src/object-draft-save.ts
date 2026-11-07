import { api, freeObject, type Json } from './api'
import { proposeInAgentSession } from './agent-runs'
import { applyObjectWrite } from './object-write'
import {
  discardObjectDraft,
  draftBaseVersion,
  draftValues,
  noteObjectDraftSaved,
  objectDraftCells,
  reviewCapabilities,
  type DraftPrincipal,
} from './object-draft'
import type { IndexedProposalCell } from './review-cells'
import type { QueryClient } from '@tanstack/react-query'

export type DraftSaveItem =
  | { kind: 'patch'; objectId: string; version: number; values: Json; texts: Record<string, string> }
  | { kind: 'propose'; objectId: string; objectKey: string; typeKey: string; version: number; values: Json }
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
}): DraftSaveItem[] {
  const items: DraftSaveItem[] = []
  const proposalObjects = new Set((input.proposals ?? []).map((cell) => cell.objectId))
  for (const objectId of input.objectIds) {
    const cells = objectDraftCells(objectId)
    if (cells.length === 0) continue
    const base = draftBaseVersion(objectId) ?? input.serverVersions[objectId] ?? 0
    const server = input.serverVersions[objectId]
    const stale = server != null && server !== base
    const conflict = proposalObjects.has(objectId)
    const capability = reviewCapabilities({
      principal: input.principal,
      viaAgent: false,
      open: true,
      stale,
      conflict,
      validationErrors: input.validationErrors ?? [],
      roleCanWrite: input.roleCanWrite,
    })
    if (!capability.canSave) {
      items.push({ kind: 'blocked', reason: capability.saveReason })
      continue
    }
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
      })
    } else {
      const texts: Record<string, string> = {}
      for (const cell of cells) texts[cell.columnId] = cell.proposedText
      items.push({ kind: 'patch', objectId, version: base, values, texts })
    }
  }
  if (items.some((item) => item.kind === 'blocked' || item.kind === 'patch' || item.kind === 'propose')) {
    return items
  }
  const capability = reviewCapabilities({
    principal: input.principal,
    viaAgent: false,
    open: true,
    stale: (input.proposals ?? []).some((cell) => cell.stale),
    conflict: (input.proposals ?? []).some((cell) => cell.conflict),
    validationErrors: input.validationErrors ?? [],
    roleCanWrite: input.roleCanWrite,
  })
  if (!capability.canSave) return [{ kind: 'blocked', reason: capability.saveReason }]
  const byProposal = new Map<string, string[]>()
  for (const cell of input.proposals ?? []) {
    const rows = byProposal.get(cell.proposalId) ?? []
    if (!rows.includes(cell.rowId)) rows.push(cell.rowId)
    byProposal.set(cell.proposalId, rows)
  }
  for (const [proposalId, rowIds] of byProposal) {
    if (proposalId && rowIds.length > 0) items.push({ kind: 'accept', proposalId, rowIds })
  }
  return items
}

export function draftDiscardPlan(input: {
  objectIds: string[]
  principal: DraftPrincipal
  viaAgent: boolean
  proposals?: IndexedProposalCell[]
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
  const clear = input.objectIds.filter((id) => objectDraftCells(id).length > 0)
  const discard = [...new Set((input.proposals ?? []).map((cell) => cell.proposalId).filter(Boolean))]
  return { clear, discard, reason: '' }
}

let saving = false

export function objectDraftSaving(): boolean {
  return saving
}

export async function runDraftDiscard(input: {
  objectIds: string[]
  proposals?: IndexedProposalCell[]
  principal: DraftPrincipal
  viaAgent: boolean
}): Promise<string> {
  const plan = draftDiscardPlan(input)
  if (plan.reason) return plan.reason
  for (const id of plan.clear) discardObjectDraft(id)
  for (const id of plan.discard) {
    await api.post('/v1/proposals/{id}/discard', { params: { path: { id } } })
  }
  return ''
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
  try {
    for (const item of items) {
      if (item.kind === 'patch') {
        const saved = await api.patch('/v1/objects/{id}', {
          params: { path: { id: item.objectId }, header: { 'If-Match': item.version } },
          body: { values: freeObject(item.values) },
        }) as Json
        const version = Number(saved.version ?? item.version + 1)
        noteObjectDraftSaved(item.objectId, Number.isFinite(version) ? version : item.version + 1)
        await applyObjectWrite(queryClient, saved)
      } else if (item.kind === 'propose') {
        await proposeInAgentSession(agentRunId, {
          objectId: item.objectId,
          objectKey: item.objectKey,
          typeKey: item.typeKey,
          baseVersion: item.version,
          values: item.values,
        })
        discardObjectDraft(item.objectId)
      } else if (item.kind === 'accept') {
        await api.post('/v1/proposals/{id}/accept', {
          params: { path: { id: item.proposalId } },
          body: { rows: item.rowIds },
        })
      }
    }
    return ''
  } finally {
    saving = false
  }
}
