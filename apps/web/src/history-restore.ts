import { ApiError, api, failureLines, type Json } from './api'
import { suggestionLines } from './field-diff'
import { copy } from './i18n'

export function rollbackDiffLines(proposal: Json | undefined, defs: Json | undefined) {
  const rows = (proposal?.rows as Json[] | undefined) ?? []
  const objectRow = rows.find((row) => row.object_id)
  if (!objectRow) return []
  return suggestionLines(objectRow.base_values as Json | undefined, objectRow.patch, defs)
}

export type HistoryRestoreResult =
  | { kind: 'empty' }
  | { kind: 'restored'; proposalId: string }

/** Creates a rollback proposal and accepts it when the diff is non-empty. */
export async function restoreHistoryVersion(
  objectId: string,
  seq: number,
  defs: Json | undefined,
): Promise<HistoryRestoreResult> {
  const proposal = await api.post('/v1/objects/{id}/rollback', {
    params: { path: { id: objectId } },
    body: { seq },
  })
  const proposalId = String(proposal.id)
  const full = await api.get('/v1/proposals/{id}', { params: { path: { id: proposalId } } })
  const lines = rollbackDiffLines(full, defs)
  if (lines.length === 0) {
    try {
      await api.post('/v1/proposals/{id}/discard', { params: { path: { id: proposalId } } })
    } catch {
      // Best-effort discard for a no-op restore.
    }
    return { kind: 'empty' }
  }
  const result = await api.post('/v1/proposals/{id}/accept', { params: { path: { id: proposalId } }, body: {} })
  const failed = failureLines(result)
  if (failed.length > 0) {
    throw new Error(String(failed[0]?.detail ?? copy.validation))
  }
  return { kind: 'restored', proposalId }
}

export function historyRestoreErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.status === 409) return copy.restoreConflict
  if (reason instanceof Error && reason.message) return reason.message
  return copy.saveFailed
}