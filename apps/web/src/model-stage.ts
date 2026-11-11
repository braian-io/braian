import { api, jsonRecord, type Json } from './api'
import { publishProposal } from './proposal-bus'

export type ModelFocus =
  | { kind: 'type'; key: string }
  | { kind: 'attribute'; key: string }
  | { kind: 'structure'; key: string }
  | { kind: 'value_list'; key: string }
  | { kind: 'option'; list: string; code: string }
  | { kind: 'unit_family'; key: string }
  | { kind: 'unit'; family: string; code: string }

let focus: ModelFocus | null = null
const listeners = new Set<() => void>()

export function modelFocus() {
  return focus
}

export function setModelFocus(next: ModelFocus) {
  focus = next
}

export function onDraftChange(listen: () => void) {
  listeners.add(listen)
  return () => {
    listeners.delete(listen)
  }
}

function emitDraft() {
  for (const listen of listeners) listen()
}

export function modelDeletes(name: string) {
  return name.includes('delete')
}

/** A set_structures step this UI created, and where the server put it. */
export type StagedStructures = { index: number; typeKey: string; structures: string[] }

let stagedStructures: StagedStructures[] = []

/** Review cancellations remove these steps only, never older ones on the same type. */
export function takeStagedStructures(): StagedStructures[] {
  const taken = stagedStructures
  stagedStructures = []
  return taken
}

export function clearStagedStructures() {
  stagedStructures = []
}

/** A toggle keeps its checkbox locked until the review dialog is decided. */
export type StructuresLock = { token: number; typeKey: string }

let structuresLock: StructuresLock | null = null
let nextStructuresToken = 1
const lockListeners = new Set<() => void>()

function emitStructuresLock() {
  for (const listen of lockListeners) listen()
}

/** The type whose allowed-tree checkbox is locked, or null. */
export function lockedStructuresType(): string | null {
  return structuresLock?.typeKey ?? null
}

export function onStructuresLockChange(listen: () => void) {
  lockListeners.add(listen)
  return () => {
    lockListeners.delete(listen)
  }
}

/** Releases the lock, but only for the token that owns it. */
export function releaseStructuresLock(token?: number) {
  if (!structuresLock) return
  if (token !== undefined && structuresLock.token !== token) return
  structuresLock = null
  emitStructuresLock()
}

type StructuresStage = {
  token: number
  typeKey: string
  cancelled: boolean
  settled: boolean
  promise: Promise<unknown>
}

let structuresStage: StructuresStage | null = null

/** True while a set_structures request is on its way and can still be cancelled. */
export function structuresStageInFlight(): boolean {
  return Boolean(structuresStage && !structuresStage.settled)
}

/**
 * Marks the in-flight set_structures request as cancelled. The request itself
 * is not aborted (the step may already exist), but its result is removed again
 * and the caller's promise rejects with `StructuresCancelled`.
 */
export function cancelStructuresStage(): boolean {
  if (!structuresStage || structuresStage.settled) return false
  structuresStage.cancelled = true
  return true
}

export class StructuresCancelled extends Error {
  constructor() {
    super('')
    this.name = 'StructuresCancelled'
  }
}

function cancelledError() {
  return new StructuresCancelled()
}

function sameStructures(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

/**
 * The step this call created, found by its type and structures rather than by
 * assuming it is the last step in the draft. Other components may have added
 * steps before the response arrives.
 */
function rememberStructures(result: unknown, name: string, args: Json): StagedStructures | undefined {
  if (name !== 'model.set_structures') return undefined
  const record = jsonRecord(result)
  const steps = Array.isArray(record?.steps) ? record.steps : []
  const typeKey = String(args.type_key ?? '')
  const structures = Array.isArray(args.structures) ? args.structures.map(String) : []
  if (!typeKey) return undefined
  let found: StagedStructures | undefined
  steps.forEach((raw, index) => {
    const step = jsonRecord(raw)
    if (!step || step.op !== 'set_structures') return
    if (String(step.type_key ?? '') !== typeKey) return
    const now = Array.isArray(step.structures) ? step.structures.map(String) : []
    if (!sameStructures(now, structures)) return
    found = { index, typeKey, structures: now }
  })
  return found
}

function dispatch(name: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(name))
}

/**
 * Stages one allowed-tree change. A repeated click while the same change is
 * still in flight returns that request instead of posting a second identical
 * step. A different set for a type replaces the step this UI staged earlier.
 */
async function stageStructures(name: string, args: Json): Promise<unknown> {
  const typeKey = String(args.type_key ?? '')
  const inFlight = structuresStage
  if (inFlight && !inFlight.settled) {
    // A double click lands here before the first response. Coalesce instead of
    // creating a second set_structures step for the same type.
    return inFlight.promise
  }

  const token = nextStructuresToken++
  const stage: StructuresStage = {
    token,
    typeKey,
    cancelled: false,
    settled: false,
    promise: Promise.resolve(),
  }
  structuresStage = stage
  structuresLock = { token, typeKey }
  emitStructuresLock()
  // The review shell must appear on the click, before the draft is fetched.
  dispatch('braian-review-pending')

  const work = (async () => {
    try {
      // Replace, never append twice, when this UI already staged a set for the
      // same type. Foreign steps on the type are not in this list.
      const previous = stagedStructures.filter((item) => item.typeKey === typeKey)
      if (previous.length > 0) {
        stagedStructures = stagedStructures.filter((item) => item.typeKey !== typeKey)
        await removeDraftSteps(previous.map((item) => item.index))
      }
      if (stage.cancelled) throw cancelledError()

      const draft = await api.post('/v1/model/draft/steps', { body: { operation: name, args } })
      const record = rememberStructures(draft, name, args)
      if (record) stagedStructures = [...stagedStructures.filter((item) => item.typeKey !== typeKey), record]

      if (stage.cancelled) {
        if (record) {
          stagedStructures = stagedStructures.filter((item) => item !== record)
          await removeDraftSteps([record.index])
        }
        throw cancelledError()
      }
      emitDraft()
      return draft
    } catch (reason) {
      if (reason instanceof StructuresCancelled) throw reason
      // The request failed: nothing is waiting for review, so unlock the box.
      releaseStructuresLock(token)
      dispatch('braian-review-pending-end')
      throw reason
    } finally {
      stage.settled = true
      if (structuresStage === stage) structuresStage = null
      if (stage.cancelled) {
        releaseStructuresLock(token)
        dispatch('braian-review-pending-end')
      }
    }
  })()
  stage.promise = work
  return work
}

/** A person's edit joins the draft. A delete opens the consequence dialog. */
export async function stageModel(name: string, args: Json = {}) {
  if (modelDeletes(name)) {
    const result = await api.post('/v1/operations/{name}', { params: { path: { name: name } }, body: args })
    const record = jsonRecord(result)
    const id = String(record?.proposal_id ?? record?.id ?? '')
    if (id) publishProposal(id)
    return result
  }
  if (name === 'model.set_structures') return stageStructures(name, args)
  const draft = await api.post('/v1/model/draft/steps', { body: { operation: name, args } })
  emitDraft()
  return draft
}

/** Raw steps collected in the draft. Deletes use this because the operation cannot. */
export async function stageModelSteps(steps: Array<{ op: string } & Record<string, unknown>>) {
  const draft = await api.post('/v1/model/draft/steps', { body: { steps } })
  emitDraft()
  return draft
}

/** Remove only the named draft steps. Higher indexes go first so the rest stay valid. */
export async function removeDraftSteps(indexes: number[]) {
  if (indexes.length === 0) return undefined
  let result: unknown
  for (const index of [...new Set(indexes)].sort((left, right) => right - left)) {
    result = await api.post('/v1/model/draft/steps', { body: { remove: index } })
  }
  emitDraft()
  return result
}

export function openModelDialog(kind: 'type' | 'list' | 'family' | 'tree' | 'link') {
  window.dispatchEvent(new CustomEvent('braian-model-dialog', { detail: kind }))
}

export function requestReview() {
  window.dispatchEvent(new Event('braian-review-save'))
}

export function requestDiscardDraft() {
  window.dispatchEvent(new Event('braian-discard-draft'))
}
