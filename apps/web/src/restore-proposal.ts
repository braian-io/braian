import { ApiError } from './api'
import { copy } from './i18n'

export function isRollbackProposal(source: unknown): boolean {
  return String(source ?? '') === 'rollback'
}

export function restoreAcceptConflictMessage(reason: unknown): string | null {
  if (reason instanceof ApiError && reason.status === 409) return copy.restoreConflict
  return null
}