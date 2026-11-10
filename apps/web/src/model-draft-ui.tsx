import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, textValue, type Json } from './api'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { writeErrorMessage } from './write-error'
import { formatCount, formatTimestamp } from './format'
import { copy, uiLanguage } from './i18n'
import { attributeKey } from './model-view'
import { onDraftChange, removeDraftSteps, requestDiscardDraft, setModelFocus, stageModel } from './model-stage'
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

/** Indices of the allowed-tree steps that belong to the last changed type. */
export function allowedTreeStepIndexes(body: Json): number[] {
  const steps = Array.isArray(body.steps) ? body.steps : []
  const last = [...steps].reverse().map(asRecord).find((step) => step?.op === 'set_structures')
  const typeKey = String(last?.type_key ?? '')
  return steps.flatMap((step, index) => {
    const record = asRecord(step)
    if (record?.op !== 'set_structures') return []
    if (typeKey && String(record.type_key ?? '') !== typeKey) return []
    return [index]
  })
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

type DialogKind = 'type' | 'list' | 'family' | 'tree' | 'link'

export function ModelDraftHost() {
  const queryClient = useQueryClient()
  const draft = useQuery({ queryKey: ['model-draft'], queryFn: () => api.get('/v1/model/draft') })
  const [review, setReview] = useState(false)
  const [reviewLoading, setReviewLoading] = useState(false)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const saving = useRef(false)
  const again = useRef(false)
  const rememberOpener = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  const closeReview = () => {
    setReview(false)
    const target = opener.current
    opener.current = null
    if (target?.isConnected) queueMicrotask(() => target.focus())
  }
  useEffect(() => onDraftChange(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }), [queryClient])
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
    void queryClient.invalidateQueries({ queryKey: ['definitions'] })
  }
  // Cancel removes only the allowed-tree step, so other draft work survives.
  const revertReviewSteps = (indexes: number[]) => {
    if (indexes.length === 0) return
    void removeDraftSteps(indexes).catch((reason: unknown) => {
      const message = writeErrorMessage(reason)
      if (message) setError(message)
    })
  }
  const decide = async (showProgress = false) => {
    if (saving.current) {
      again.current = true
      return
    }
    saving.current = true
    rememberOpener()
    setBusy(true)
    if (showProgress) setReviewLoading(true)
    setError('')
    let posted = ''
    try {
      do {
        again.current = false
        // Steps can be staged right before the request, so the cached count may
        // still be zero. Read the draft again before saving or confirming.
        const result = await draft.refetch()
        const body = result.data
        const gate = draftSaveGate(body)
        if ((gate === 'confirm' || gate === 'blocked') && body) {
          setReviewLoading(false)
          setReview(true)
          if (!again.current) return
          continue
        }
        if (gate !== 'direct' || !body) continue
        const token = JSON.stringify(body.steps ?? body.updated_at ?? body.count)
        if (token === posted) break
        await api.post('/v1/model/draft/save', { body: draftSaveBody(body) })
        posted = token
        setReview(false)
        setReviewLoading(false)
        refresh()
      } while (again.current)
    } catch (reason: unknown) {
      const message = writeErrorMessage(reason)
      if (message) setError(message)
    } finally {
      saving.current = false
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
      void api.delete('/v1/model/draft').then(() => {
        setError('')
        void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
      }).catch((reason: unknown) => {
        const message = writeErrorMessage(reason)
        if (message) setError(message)
      })
    }
    const ask = (event: Event) => setDialog((event as CustomEvent<DialogKind>).detail)
    window.addEventListener('braian-review-save', open)
    window.addEventListener('braian-discard-draft', discard)
    window.addEventListener('braian-model-dialog', ask)
    return () => {
      window.removeEventListener('braian-review-save', open)
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
      {reviewLoading && !review ? <ReviewLoadingDialog /> : null}
      {review && draft.data ? (
        <ReviewDialog
          body={draft.data}
          onClose={closeReview}
          onRevert={revertReviewSteps}
          onSaved={() => {
            setReview(false)
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
  onClose,
  onRevert,
  onSaved,
}: {
  body: Json
  onClose: () => void
  onRevert: (indexes: number[]) => void
  onSaved: () => void
}) {
  const blocked = draftSaveGate(body) === 'blocked'
  const destructive = asRecord(body.consequence)?.destructive === true
  // A non-destructive allowed-tree change is reviewed too. Cancel removes only
  // that step, so unrelated draft work stays.
  const forced = !blocked && !destructive && draftHasForcedReview(body)
  const lead = !blocked && !destructive && draftHasForcedReview(body)
    ? allowedTreesSentence(body) ?? confirmLead(body)
    : confirmLead(body)
  const warnings = (body.warnings as string[] | undefined) ?? []
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const close = () => {
    if (forced) onRevert(allowedTreeStepIndexes(body))
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

function ReviewLoadingDialog() {
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        className="consequence review-loading"
        data-testid="review-loading"
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <div className="toolbar">
          <DialogTitle asChild><strong>{copy.reviewChangeTitle}</strong></DialogTitle>
        </div>
        <DialogDescription asChild><p className="hint">{copy.reviewChange}</p></DialogDescription>
        <StateNote tone="loading" title={copy.loadingModel} />
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
