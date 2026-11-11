import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, textValue, type Json } from './api'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { writeErrorMessage } from './write-error'
import { formatCount, formatTimestamp } from './format'
import { copy, uiLanguage } from './i18n'
import { attributeKey } from './model-view'
import {
  onDraftChange,
  onStructuresLockChange,
  cancelStructuresStage,
  clearStagedStructures,
  lockedStructuresType,
  releaseStructuresLock,
  removeDraftSteps,
  requestDiscardDraft,
  setModelFocus,
  stageModel,
  structuresStageInFlight,
  structuresStageTarget,
  takeStagedStructures,
  type StagedStructures,
} from './model-stage'
import { describeModelSteps } from './model-step-text'
import { registerModelDefinitions } from './model-selection'
import { StateNote } from './states'

export type DraftSaveGate = 'idle' | 'direct' | 'confirm' | 'blocked'

function asRecord(value: unknown): Json | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Json
}

/** Allowed trees are reviewed even when the change is not destructive. */
export function draftHasForcedReview(body: Json | null | undefined): boolean {
  if (!body) return false
  const steps = body.steps
  if (!Array.isArray(steps)) return false
  return steps.some((step) => asRecord(step)?.op === 'set_structures')
}

/** Preview error, `consequence.destructive`, and the allowed-tree operation. */
export function draftSaveGate(body: Json | null | undefined): DraftSaveGate {
  if (!body) return 'idle'
  if (Number(body.count ?? 0) <= 0 || body.conflict === true) return 'idle'
  if (body.error) return 'blocked'
  if (asRecord(body.consequence)?.destructive === true) return 'confirm'
  if (draftHasForcedReview(body)) return 'confirm'
  return 'direct'
}

/** Name the server already requires. Never collected from a typed field. */
export function draftSaveBody(body: Json): Json {
  const consequence = asRecord(body.consequence)
  const name = String(consequence?.confirm_name ?? '')
  if (consequence?.destructive === true && name) return { confirm_name: name }
  return {}
}

function confirmLead(body: Json): string {
  if (body.error) return String(body.error)
  const consequence = asRecord(body.consequence)
  const lines = (body.lines as string[] | undefined) ?? (consequence?.lines as string[] | undefined) ?? []
  // A forced allowed-tree review has nothing to delete; allowedTreesSentence
  // names the changed trees. Never fall back to the server's raw-key line.
  if (draftHasForcedReview(body) && consequence?.destructive !== true) {
    return copy.allowedTrees.replace('…', '')
  }
  const sentence = String(consequence?.sentence ?? '')
  if (sentence) return sentence
  return lines[0] || copy.destructiveSave
}

/**
 * Indices of the allowed-tree steps this dialog created. Older set_structures
 * steps on the same type (staged before the toggle) are never returned.
 */
export function allowedTreeStepIndexes(body: Json, staged: StagedStructures[] = []): number[] {
  const steps = Array.isArray(body.steps) ? body.steps : []
  return [...new Set(staged.flatMap(({ index, typeKey, structures }) => {
    if (!typeKey) return []
    const step = asRecord(steps[index])
    if (step?.op !== 'set_structures') return []
    if (String(step.type_key ?? '') !== typeKey) return []
    const now = Array.isArray(step.structures) ? step.structures.map(String) : []
    if (now.join('\u0000') !== structures.join('\u0000')) return []
    return [index]
  }))].sort((left, right) => left - right)
}

/** Keep the newest record per type when a save loop collects more than once. */
function mergeStaged(current: StagedStructures[], fresh: StagedStructures[]): StagedStructures[] {
  let next = current
  for (const item of fresh) {
    next = [...next.filter((old) => old.typeKey !== item.typeKey), item]
  }
  return next
}

/** The last set_structures step for one type, in draft order. */
function lastStructures(steps: Json[], typeKey: string): string[] | undefined {
  let found: string[] | undefined
  for (const step of steps) {
    if (String(step.op ?? '') !== 'set_structures') continue
    if (String(step.type_key ?? '') !== typeKey) continue
    found = Array.isArray(step.structures) ? step.structures.map(String) : []
  }
  return found
}

function committedStructures(defs: Json | undefined, typeKey: string): string[] | undefined {
  const objectType = ((defs?.types as Json[] | undefined) ?? []).find(
    (item) => String(item.key ?? '') === typeKey || String(item.id ?? '') === typeKey,
  )
  return objectType && Array.isArray(objectType.structures)
    ? objectType.structures.map(String)
    : undefined
}

/**
 * Cached draft after removing these steps. The definitions preview is patched
 * too, so the checkbox and the count change before the server answers.
 */
function revertedDraft(body: Json, indexes: number[], committed: Json | undefined): Json | undefined {
  const steps = (Array.isArray(body.steps) ? body.steps : []).map(asRecord).filter((step): step is Json => Boolean(step))
  const remove = new Set(indexes)
  const remaining = steps.filter((_, index) => !remove.has(index))
  const removed = [...remove].flatMap((index) => steps[index] ? [steps[index]] : [])
  const types = [...new Set(removed.flatMap((step) =>
    String(step.op ?? '') === 'set_structures' ? [String(step.type_key ?? '')] : []))].filter(Boolean)
  const next: Json = { ...body, count: remaining.length, steps: remaining }
  const definitions = asRecord(body.definitions)
  if (!definitions || types.length === 0) return next
  const rows = Array.isArray(definitions.types) ? definitions.types.map(asRecord) : []
  next.definitions = {
    ...definitions,
    types: rows.map((row) => {
      if (!row) return row
      const key = String(row.key ?? '')
      const id = String(row.id ?? '')
      if (!types.includes(key) && !types.includes(id)) return row
      const structures = lastStructures(remaining, key) ?? lastStructures(remaining, id) ?? committedStructures(committed, key) ?? committedStructures(committed, id)
      return structures ? { ...row, structures } : row
    }),
  }
  return next
}

function typeLabel(defs: Json | undefined, key: string): string {
  const objectType = ((defs?.types as Json[]) ?? []).find(
    (item) => String(item.key ?? '') === key || String(item.id ?? '') === key,
  )
  return textValue(objectType?.singular, uiLanguage) || textValue(objectType?.labels, uiLanguage) || copy.objectType
}

function treeLabel(defs: Json | undefined, token: string): string {
  const tree = ((defs?.structures as Json[]) ?? []).find(
    (item) => String(item.id ?? '') === token || String(item.key ?? '') === token,
  )
  return textValue(tree?.labels, uiLanguage) || copy.structure
}

/** A display-name sentence for the allowed-tree steps, never their raw keys. */
export function allowedTreesSentence(body: Json): string | undefined {
  const steps = (Array.isArray(body.steps) ? body.steps : [])
    .map(asRecord)
    .filter((step): step is Json => step?.op === 'set_structures')
  if (steps.length === 0) return undefined
  const defs = asRecord(body.definitions)
  // Several toggles can stack in one draft. The last step for a type is its final set.
  const latest = new Map<string, string[]>()
  for (const step of steps) {
    const typeKey = String(step.type_key ?? '')
    if (!typeKey) continue
    const structures = Array.isArray(step.structures) ? step.structures.map((item) => String(item)) : []
    latest.set(typeKey, structures)
  }
  if (latest.size === 0) return undefined
  return [...latest]
    .map(([typeKey, structures]) => {
      const names = structures.map((token) => treeLabel(defs, token)).filter(Boolean)
      return `${copy.allowedTreesFor} ${typeLabel(defs, typeKey)}: ${names.length > 0 ? names.join(', ') : copy.none}`
    })
    .join(' ')
}

type PendingRevert = {
  created: StagedStructures[]
  committed: Json | undefined
  /** A step whose index is not known yet, matched by type and structures. */
  wildcard?: { typeKey: string; structures: string[] }
}

/**
 * The newest set_structures step for the exact change an in-flight request is
 * about to add. Older identical steps are never removed.
 */
function wildcardStepIndexes(body: Json, target: { typeKey: string; structures: string[] }): number[] {
  const steps = Array.isArray(body.steps) ? body.steps : []
  let found = -1
  steps.forEach((raw, index) => {
    const step = asRecord(raw)
    if (step?.op !== 'set_structures') return
    if (String(step.type_key ?? '') !== target.typeKey) return
    const now = Array.isArray(step.structures) ? step.structures.map(String) : []
    if (now.join('\u0000') !== target.structures.join('\u0000')) return
    found = index
  })
  return found >= 0 ? [found] : []
}

type DialogKind = 'type' | 'list' | 'family' | 'tree' | 'link'

export function ModelDraftHost() {
  const queryClient = useQueryClient()
  const draft = useQuery({ queryKey: ['model-draft'], queryFn: () => api.get('/v1/model/draft') })
  const storedDefs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const [review, setReview] = useState(false)
  const [reviewCreated, setReviewCreated] = useState<StagedStructures[]>([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const saving = useRef(false)
  const again = useRef(false)
  const reviewToken = useRef(0)
  const activeCreated = useRef<StagedStructures[]>([])
  const revertSeq = useRef(0)
  const patching = useRef(false)
  const pendingReverts = useRef(new Map<number, PendingRevert>())
  // The click that starts a toggle also opens the review shell under the
  // pointer. Remember where it landed so the rest of the same double/triple
  // click can be swallowed instead of dismissing that shell.
  const pendingPoint = useRef<{ x: number; y: number } | null>(null)
  const clickBurst = useRef<{ x: number; y: number; at: number } | null>(null)
  const lockStartedAt = useRef(0)
  const rememberOpener = () => {
    // The loading shell opens on the same click. Keep the real opener (the
    // checkbox) when it was captured before that dialog mounted.
    if (opener.current) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  const restoreOpener = () => {
    const target = opener.current
    opener.current = null
    if (target?.isConnected) queueMicrotask(() => target.focus())
  }
  const closeReview = () => {
    setReview(false)
    setReviewCreated([])
    releaseStructuresLock()
    restoreOpener()
  }
  useEffect(() => onDraftChange(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }), [queryClient])
  // Validate the stored selection against the definitions the model views use,
  // including unsaved draft types. data-model.tsx stays untouched.
  useEffect(() => {
    const preview = draft.data?.conflict === true ? undefined : (draft.data?.definitions as Json | undefined)
    const defs = preview ?? (storedDefs.data as Json | undefined)
    if (defs) registerModelDefinitions(defs)
  }, [draft.data, storedDefs.data])
  // While a remove is in flight a parallel GET may still return the step. Keep
  // the optimistic revert applied to whatever the cache now holds, so the box
  // and the count never flash back. The patch only touches the steps this
  // revert created; later edits are left alone.
  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (patching.current || pendingReverts.current.size === 0) return
      if (event.query.queryKey[0] !== 'model-draft') return
      const data = event.query.state.data as Json | undefined
      if (!data) return
      let next = data
      for (const revert of pendingReverts.current.values()) {
        const indexes = revert.wildcard
          ? wildcardStepIndexes(next, revert.wildcard)
          : allowedTreeStepIndexes(next, revert.created)
        if (indexes.length === 0) continue
        const patched = revertedDraft(next, indexes, revert.committed)
        if (patched) next = patched
      }
      // Once the cancelled request has settled and a fresh snapshot no longer
      // has the step, the wildcard has done its job.
      if (!structuresStageInFlight()) {
        for (const [id, revert] of pendingReverts.current) {
          if (revert.wildcard && wildcardStepIndexes(next, revert.wildcard).length === 0) {
            pendingReverts.current.delete(id)
          }
        }
      }
      if (next === data) return
      patching.current = true
      queryClient.setQueryData(['model-draft'], next)
      patching.current = false
    })
  }, [queryClient])
  // The checkbox must ignore clicks from the click that starts the change until
  // the review is decided. The control lives in a protected component, so lock
  // it at the DOM boundary instead of adding a prop there.
  useEffect(() => {
    const swallow = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const applyLock = () => {
      const locked = lockedStructuresType() !== null
      if (locked) {
        lockStartedAt.current = performance.now()
        const point = pendingPoint.current
        clickBurst.current = point ? { ...point, at: lockStartedAt.current } : null
      } else {
        clickBurst.current = null
        pendingPoint.current = null
      }
      for (const fieldset of document.querySelectorAll<HTMLElement>("[data-testid='allowed-trees']")) {
        if (locked) fieldset.setAttribute('data-locked', 'true')
        else fieldset.removeAttribute('data-locked')
        for (const input of fieldset.querySelectorAll<HTMLInputElement>("input[type='checkbox']")) {
          if (locked) input.setAttribute('aria-disabled', 'true')
          else input.removeAttribute('aria-disabled')
        }
      }
    }
    // The first pointer down records the control. The review shell is portaled
    // above it, so the second click of a double click hits the overlay at the
    // same coordinates. Swallow that burst before Radix reads it as "outside".
    const rememberPoint = (event: PointerEvent) => {
      if (lockedStructuresType() !== null) return
      const target = event.target
      if (!(target instanceof Element)) return
      const control = target.closest("input[type='checkbox'], label")
      if (!control || !control.closest("[data-testid='allowed-trees']")) return
      pendingPoint.current = { x: event.clientX, y: event.clientY }
    }
    const inBurst = (event: Event) => {
      const burst = clickBurst.current
      if (!burst || !(event instanceof MouseEvent)) return false
      if (performance.now() - burst.at > 800) {
        clickBurst.current = null
        return false
      }
      // Keyboard activation has no coordinates and is handled by keydown.
      if (event.detail === 0 && event.clientX === 0 && event.clientY === 0) return false
      return Math.abs(event.clientX - burst.x) <= 6 && Math.abs(event.clientY - burst.y) <= 6
    }
    const guard = (event: Event) => {
      if (lockedStructuresType() === null) return
      const target = event.target
      if (!(target instanceof Element)) return
      const input = target.closest("input[type='checkbox']")
      if (input && input.closest("[data-testid='allowed-trees']")) {
        swallow(event)
        return
      }
      if (inBurst(event)) swallow(event)
    }
    const keyGuard = (event: Event) => {
      if (lockedStructuresType() === null) return
      if (!(event instanceof KeyboardEvent)) return
      if (event.key !== ' ' && event.key !== 'Enter') return
      if (performance.now() - lockStartedAt.current > 800) return
      // Space twice on the box: the second one must not activate a dialog
      // button that autofocus happened to land on.
      swallow(event)
    }
    applyLock()
    for (const name of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'] as const) {
      document.addEventListener(name, guard, true)
    }
    document.addEventListener('pointerdown', rememberPoint, true)
    document.addEventListener('keydown', keyGuard, true)
    const off = onStructuresLockChange(applyLock)
    return () => {
      off()
      for (const name of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick'] as const) {
        document.removeEventListener(name, guard, true)
      }
      document.removeEventListener('pointerdown', rememberPoint, true)
      document.removeEventListener('keydown', keyGuard, true)
    }
  }, [])
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
    void queryClient.invalidateQueries({ queryKey: ['definitions'] })
  }
  // Cancel removes only the steps this dialog created, so other draft work survives.
  // The cached draft is reverted first; the server call follows. On failure the
  // truth comes from a refetch, never from the snapshot taken at click time.
  const revertReviewSteps = (created: StagedStructures[]) => {
    if (created.length === 0) return
    const cached = queryClient.getQueryData<Json>(['model-draft'])
    const committed = queryClient.getQueryData<Json>(['definitions'])
    // Remove the steps that still match this dialog's record. When the cache
    // does not have the freshly staged step yet (a delayed GET), the index the
    // server returned is the only handle; a failure is reconciled by refetch.
    const matched = cached ? allowedTreeStepIndexes(cached, created) : []
    const remove = matched.length > 0 ? matched : created.map((item) => item.index)
    const id = ++revertSeq.current
    pendingReverts.current.set(id, { created, committed })
    if (cached && matched.length > 0) {
      patching.current = true
      const next = revertedDraft(cached, matched, committed)
      if (next) queryClient.setQueryData(['model-draft'], next)
      patching.current = false
    }
    // A GET that started before this click must not put the step back.
    void queryClient.cancelQueries({ queryKey: ['model-draft'] })
    void removeDraftSteps(remove).then(() => {
      pendingReverts.current.delete(id)
      refresh()
    }).catch((reason: unknown) => {
      pendingReverts.current.delete(id)
      refresh()
      const message = writeErrorMessage(reason)
      if (message) setError(message)
    })
  }
  const cancelReview = () => {
    reviewToken.current += 1
    setReview(false)
    setReviewCreated([])
    setReviewLoading(false)
    setError('')
    const staging = cancelStructuresStage()
    if (saving.current) {
      // A save loop is already running and holds the staged record. Revert it
      // now so the checkbox and the count respond to Cancel immediately.
      const created = activeCreated.current
      activeCreated.current = []
      if (created.length > 0) revertReviewSteps(created)
    } else if (!staging) {
      const created = takeStagedStructures()
      if (created.length > 0) revertReviewSteps(created)
    } else {
      // The POST is still in flight. Its step has no index yet, so remember the
      // change itself and strip it from any draft snapshot that arrives late.
      const target = structuresStageTarget()
      if (target) {
        const id = ++revertSeq.current
        pendingReverts.current.set(id, {
          created: [],
          committed: queryClient.getQueryData<Json>(['definitions']),
          wildcard: target,
        })
        void queryClient.cancelQueries({ queryKey: ['model-draft'] })
      }
    }
    releaseStructuresLock()
    restoreOpener()
  }
  const decide = async (showProgress = false) => {
    if (saving.current) {
      again.current = true
      return
    }
    const token = ++reviewToken.current
    saving.current = true
    rememberOpener()
    setBusy(true)
    if (showProgress) setReviewLoading(true)
    setError('')
    let posted = ''
    try {
      do {
        again.current = false
        // A second stage can land while this loop is running. Collect it rather
        // than dropping it, and replace an older record for the same type.
        activeCreated.current = mergeStaged(activeCreated.current, takeStagedStructures())
        // Steps can be staged right before the request, so the cached count may
        // still be zero. Read the draft again before saving or confirming.
        const result = await draft.refetch()
        if (token !== reviewToken.current) {
          // Cancelled while the draft was loading: remove what this loop created.
          const created = activeCreated.current
          activeCreated.current = []
          revertReviewSteps(created)
          return
        }
        const body = result.data
        const gate = draftSaveGate(body)
        if ((gate === 'confirm' || gate === 'blocked') && body) {
          setReviewLoading(false)
          setReviewCreated(activeCreated.current)
          activeCreated.current = []
          setReview(true)
          if (!again.current) return
          continue
        }
        if (gate !== 'direct' || !body) continue
        const change = JSON.stringify(body.steps ?? body.updated_at ?? body.count)
        if (change === posted) break
        await api.post('/v1/model/draft/save', { body: draftSaveBody(body) })
        posted = change
        setReview(false)
        setReviewCreated([])
        setReviewLoading(false)
        releaseStructuresLock()
        refresh()
      } while (again.current)
    } catch (reason: unknown) {
      // A cancel aborts the in-flight refetch; that is not a write error.
      if (token === reviewToken.current) {
        const message = writeErrorMessage(reason)
        if (message) setError(message)
      }
    } finally {
      saving.current = false
      activeCreated.current = []
      setBusy(false)
      setReviewLoading(false)
    }
  }
  const decideRef = useRef(decide)
  decideRef.current = decide
  useEffect(() => {
    const open = () => {
      void decideRef.current(true)
    }
    const discard = () => {
      clearStagedStructures()
      releaseStructuresLock()
      void api.delete('/v1/model/draft').then(() => {
        setError('')
        void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
      }).catch((reason: unknown) => {
        const message = writeErrorMessage(reason)
        if (message) setError(message)
      })
    }
    const pending = () => {
      rememberOpener()
      setError('')
      setReview(false)
      setReviewLoading(true)
    }
    const pendingEnd = () => setReviewLoading(false)
    const ask = (event: Event) => setDialog((event as CustomEvent<DialogKind>).detail)
    window.addEventListener('braian-review-save', open)
    window.addEventListener('braian-review-pending', pending)
    window.addEventListener('braian-review-pending-end', pendingEnd)
    window.addEventListener('braian-discard-draft', discard)
    window.addEventListener('braian-model-dialog', ask)
    return () => {
      window.removeEventListener('braian-review-save', open)
      window.removeEventListener('braian-review-pending', pending)
      window.removeEventListener('braian-review-pending-end', pendingEnd)
      window.removeEventListener('braian-discard-draft', discard)
      window.removeEventListener('braian-model-dialog', ask)
    }
  }, [queryClient])
  const count = Number(draft.data?.count ?? 0)
  const conflict = draft.data?.conflict === true
  return (
    <>
      {count > 0 ? (
        <div className="draft-bar" data-testid="unsaved-changes" role="status">
          <span>{formatCount(count)} {copy.unsavedChanges}</span>
          {draft.data?.updated_at ? <time dateTime={String(draft.data.updated_at)}>{formatTimestamp(draft.data.updated_at)}</time> : null}
          {conflict ? <span>{copy.draftConflict} {draft.data?.updated_at ? formatTimestamp(draft.data.updated_at) : ''}</span> : null}
          {conflict ? (
            <Button
              type="button"
              variant="default"
              onClick={() => {
                void api.post('/v1/model/draft/rebase').then(() => {
                  setError('')
                  refresh()
                }).catch((reason: unknown) => {
                  const message = writeErrorMessage(reason)
                  if (message) setError(message)
                })
              }}
            >
              {copy.rebaseDraft}
            </Button>
          ) : (
            <Button type="button" variant="primary" data-testid="review-save" disabled={busy || review || reviewLoading} onClick={() => { void decide(draftSaveGate(draft.data) === 'confirm') }}>{copy.reviewAndSave}</Button>
          )}
          <Button
            type="button"
            variant="danger"
            data-testid="discard-draft"
            disabled={busy || review || reviewLoading}
            onClick={() => requestDiscardDraft()}
          >
            {copy.discardDraft}
          </Button>
          {error ? <span className="error">{error}</span> : null}
        </div>
      ) : null}
      {reviewLoading && !review ? <ReviewLoadingDialog onCancel={cancelReview} /> : null}
      {review && draft.data ? (
        <ReviewDialog
          body={draft.data}
          created={reviewCreated}
          onClose={closeReview}
          onRevert={revertReviewSteps}
          onSaved={() => {
            setReview(false)
            setReviewCreated([])
            releaseStructuresLock()
            opener.current = null
            refresh()
          }}
        />
      ) : null}
      {dialog ? <CreateDialog kind={dialog} onClose={() => setDialog(null)} /> : null}
    </>
  )
}

function ReviewDialog({
  body,
  created,
  onClose,
  onRevert,
  onSaved,
}: {
  body: Json
  created: StagedStructures[]
  onClose: () => void
  onRevert: (created: StagedStructures[]) => void
  onSaved: () => void
}) {
  const blocked = draftSaveGate(body) === 'blocked'
  const destructive = asRecord(body.consequence)?.destructive === true
  // The highlighted step already names the allowed-tree change. Keep the lead
  // neutral so the dialog does not repeat the same sentence above the list.
  // Cancel removes only the steps this dialog created, so earlier and
  // unrelated draft work stays.
  const lead = !blocked && !destructive && draftHasForcedReview(body)
    ? copy.reviewChange
    : confirmLead(body)
  const warnings = (body.warnings as string[] | undefined) ?? []
  const steps = describeModelSteps(body.steps, asRecord(body.definitions))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const close = () => {
    onRevert(created)
    onClose()
  }
  const save = () => {
    if (saving.current || blocked) return
    saving.current = true
    setBusy(true)
    setError('')
    void api.post('/v1/model/draft/save', { body: draftSaveBody(body) })
      .then(() => onSaved())
      .catch((reason: unknown) => {
        const message = writeErrorMessage(reason)
        if (message) setError(message)
      })
      .finally(() => {
        saving.current = false
        setBusy(false)
      })
  }
  return (
    <Dialog open onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent
        className="consequence"
        data-testid="review-dialog"
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="toolbar">
          <DialogTitle asChild><strong>{copy.reviewChangeTitle}</strong></DialogTitle>
        </div>
        <DialogDescription asChild><p className="hint">{lead}</p></DialogDescription>
        {steps.length > 0 ? (
          <ul className="review-steps" data-testid="review-steps">
            {steps.map((step) => (
              <li
                key={step.key}
                className={step.allowedTrees ? 'review-step allowed-trees-step' : 'review-step'}
                data-testid="review-step"
                data-op={step.op}
                data-highlight={step.allowedTrees ? 'true' : undefined}
              >
                {step.sentence}
              </li>
            ))}
          </ul>
        ) : null}
        {blocked ? <p className="error" role="alert">{String(body.error)}</p> : null}
        {warnings.map((warning) => <p key={warning} className="error">{warning}</p>)}
        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="toolbar">
          <Button type="button" variant="ghost" onClick={close}>{copy.cancel}</Button>
          {blocked ? null : (
            <Button
              type="button"
              variant={destructive ? 'danger' : 'primary'}
              data-testid="confirm-review"
              disabled={busy}
              onClick={save}
            >
              {destructive ? copy.delete : copy.save}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReviewLoadingDialog({ onCancel }: { onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent
        className="consequence review-loading"
        data-testid="review-loading"
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <div className="toolbar">
          <DialogTitle asChild><strong>{copy.reviewChangeTitle}</strong></DialogTitle>
        </div>
        <DialogDescription asChild><p className="hint">{copy.reviewChange}</p></DialogDescription>
        <StateNote tone="loading" title={copy.loadingModel} />
        <div className="toolbar">
          <Button type="button" variant="ghost" data-testid="review-loading-cancel" onClick={onCancel}>{copy.cancel}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CreateDialog({ kind, onClose }: { kind: DialogKind; onClose: () => void }) {
  const [label, setLabel] = useState('')
  const [extra, setExtra] = useState('')
  const [fromType, setFromType] = useState('')
  const [toType, setToType] = useState('')
  const [error, setError] = useState('')
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions'), enabled: kind === 'link' })
  const entities = ((defs.data?.types as Json[] | undefined) ?? [])
    .filter((item) => item.kind !== 'link')
    .map((item) => String(item.key ?? ''))
    .filter(Boolean)
  useEffect(() => {
    if (kind !== 'link') return
    if (!fromType && entities[0]) setFromType(entities[0])
    if (!toType && entities[0]) setToType(entities[0])
  }, [kind, fromType, toType, entities])
  const title = kind === 'link' ? copy.newLinkType : kind === 'type' ? copy.newType : kind === 'list' ? copy.newValueList : kind === 'family' ? copy.newUnitFamily : copy.newTree
  const submit = () => {
    const name = label.trim()
    const key = attributeKey(name)
    if (!key) return
    const side = attributeKey(name)
    if (kind === 'link') setModelFocus({ kind: 'type', key })
    const work = kind === 'link'
      ? stageModel('model.create_link_type', {
          key,
          label: name,
          from_types: [fromType],
          to_types: [toType],
          from_key: side,
          from_label: name,
          to_key: `${side}_to`,
          to_label: name,
          from_cardinality: 'many',
          to_cardinality: 'many',
          attributes: extra.split(',').map((item) => attributeKey(item)).filter(Boolean),
        })
      : kind === 'type'
      ? stageModel('model.create_type', { key, label: name })
      : kind === 'list'
        ? stageModel('model.create_value_list', {
            key,
            label: name,
            options: extra.split(',').map((item) => item.trim()).filter(Boolean).map((item) => ({
              code: attributeKey(item),
              label: item,
            })),
          })
        : kind === 'family'
          ? stageModel('model.create_unit_family', {
              key,
              dimension: name,
              base_unit: extra.trim() || key,
              units: [{ code: extra.trim() || key, factor: '1' }],
            })
          : stageModel('model.create_structure', { key, label: name })
    void work.then(() => onClose()).catch((reason: unknown) => {
      const message = writeErrorMessage(reason)
      if (message) setError(message)
    })
  }
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        data-testid="model-dialog"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <DialogTitle asChild><strong>{title}</strong></DialogTitle>
          <label className="model-field">
            {copy.attributeName}
            <input data-testid="model-dialog-name" autoFocus aria-label={copy.attributeName} value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          {kind === 'link' ? (
            <>
              <label className="model-field">
                {copy.fromType}
                <select data-testid="link-type-from" aria-label={copy.fromType} value={fromType} onChange={(event) => setFromType(event.target.value)}>
                  {entities.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </label>
              <label className="model-field">
                {copy.toType}
                <select data-testid="link-type-to" aria-label={copy.toType} value={toType} onChange={(event) => setToType(event.target.value)}>
                  {entities.map((key) => <option key={key} value={key}>{key}</option>)}
                </select>
              </label>
              <label className="model-field">
                {copy.linkAttribute}
                <input data-testid="link-type-attribute" aria-label={copy.linkAttribute} value={extra} onChange={(event) => setExtra(event.target.value)} />
              </label>
            </>
          ) : null}
          {kind === 'list' ? (
            <label className="model-field">
              {copy.options}
              <input data-testid="model-dialog-options" aria-label={copy.options} value={extra} onChange={(event) => setExtra(event.target.value)} />
            </label>
          ) : null}
          {kind === 'family' ? (
            <label className="model-field">
              {copy.baseUnit}
              <input data-testid="model-dialog-unit" aria-label={copy.baseUnit} value={extra} onChange={(event) => setExtra(event.target.value)} />
            </label>
          ) : null}
          {error ? <p className="error">{error}</p> : null}
          <div className="toolbar">
            <Button type="button" variant="default" onClick={onClose}>{copy.cancel}</Button>
            <Button type="submit" variant="primary" data-testid="model-dialog-save">{copy.save}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
