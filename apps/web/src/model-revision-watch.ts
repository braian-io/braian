import type { Json } from './api'
import { liveOperation } from './activity'

/** Current model revision from a definitions payload, if present. */
export function modelRevisionFromDefinitions(defs: Json | undefined): number | undefined {
  const value = defs?.model_revision
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** True when the live stream payload is a committed model revision. */
export function isModelLiveEvent(raw: string): boolean {
  return liveOperation(raw) === 'model'
}

let ownModelSaveDepth = 0
let acknowledgedRevision: number | null = null

/** Marks this session as saving the model (suppress reload banner until complete). */
export function beginOwnModelSave() {
  ownModelSaveDepth += 1
}

/** Ends an own save and records the revision the server returned. */
export function endOwnModelSave(modelRevision: number | undefined) {
  ownModelSaveDepth = Math.max(0, ownModelSaveDepth - 1)
  if (typeof modelRevision === 'number' && Number.isFinite(modelRevision)) {
    acknowledgedRevision = modelRevision
  }
}

/** Clears own-save bookkeeping (tests). */
export function resetOwnModelSaveState() {
  ownModelSaveDepth = 0
  acknowledgedRevision = null
}

export function ownModelSaveInFlight(): boolean {
  return ownModelSaveDepth > 0
}

/**
 * Whether a remote model save should surface the reload banner.
 * `loadedRevision` is what this client already paints; `serverRevision` is the latest fetch.
 */
export function shouldShowModelReloadBanner(
  loadedRevision: number | undefined,
  serverRevision: number | undefined,
): boolean {
  if (ownModelSaveDepth > 0) return false
  if (serverRevision === undefined) return false
  if (loadedRevision === undefined) return true
  if (serverRevision <= loadedRevision) return false
  if (acknowledgedRevision !== null && serverRevision === acknowledgedRevision) return false
  return true
}

/** After definitions are applied locally, align acknowledged revision with the cache. */
export function syncAcknowledgedRevision(revision: number | undefined) {
  if (revision === undefined) return
  if (acknowledgedRevision !== null && revision >= acknowledgedRevision) {
    acknowledgedRevision = revision
  }
  if (ownModelSaveDepth > 0 && revision !== undefined) {
    acknowledgedRevision = revision
    ownModelSaveDepth = 0
  }
}