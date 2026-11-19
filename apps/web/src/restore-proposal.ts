import { ApiError, recordNumber, recordTitle, type Json } from './api'
import { copy, uiLanguage } from './i18n'

export function isRollbackProposal(source: unknown): boolean {
  return String(source ?? '') === 'rollback'
}

export function rollbackTargetSeqFromPatch(patch: unknown): number | undefined {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return undefined
  const seq = (patch as Json)._rollback_seq
  return typeof seq === 'number' && Number.isFinite(seq) ? seq : undefined
}

export function objectDisplayLabel(values: Json | undefined, objectKey: string | undefined): string {
  const name = recordTitle(values, uiLanguage)
  const number = recordNumber(values)
  const parts = [name, number].filter(Boolean)
  if (parts.length > 0) return parts.join(' ')
  return objectKey?.trim() ?? ''
}

export function restoreTitle(label: string, version: number | undefined): string {
  const name = label.trim() || copy.objects
  if (version != null && version > 0) {
    return copy.restoreObjectVersion
      .replace('{object}', name)
      .replace('{version}', String(version))
  }
  return copy.restoreObject.replace('{object}', name)
}

export function versionAtSeq(changes: Json[] | undefined, targetSeq: number | undefined): number | undefined {
  if (targetSeq == null || !Array.isArray(changes)) return undefined
  const entry = changes.find((row) => Number(row.seq) === targetSeq)
  const version = entry?.version
  return typeof version === 'number' && Number.isFinite(version) ? version : undefined
}

/** History rollback passes `rollbackSeq` in the open event; Review opens the same proposal without it. */
export function discardRestoreOnDismiss(rollbackSeq: number | undefined): boolean {
  return rollbackSeq != null
}

export type RestoreDismissOutcome = { close: boolean; message: string | null }

/** Maps discard failures when closing the restore dialog. 404 closes quietly. */
export function restoreDiscardFailure(reason: unknown): RestoreDismissOutcome {
  if (reason instanceof ApiError) {
    if (reason.status === 404) return { close: true, message: null }
    if (reason.status === 409) return { close: false, message: copy.restoreConflict }
    if (reason.status >= 500) return { close: false, message: copy.saveFailed }
  }
  const message = reason instanceof Error ? reason.message : copy.validation
  return { close: false, message }
}

export function restoreAcceptConflictMessage(reason: unknown): string | null {
  if (reason instanceof ApiError && reason.status === 409) return copy.restoreConflict
  return null
}