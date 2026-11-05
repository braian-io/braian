import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'
import {
  choiceLabel,
  choiceValue,
  linkCardinalityMessage,
  linkConstrainedType,
  linkEndLabel,
  linkEndsSummary,
  linkFieldErrors,
  linkFieldValues,
  linkPairExplanation,
  linksForEnds,
  preferredChoice,
  type LinkChoice,
  type LinkDirection,
} from './link-choices'
import { linkFailure, replaceConflictingLink, type LinkSubmitResult, type LinkWrite, type LinkWriteFailure } from './link-write'
import { pushLinkUi } from './link-ui'
import type { Json } from './api'

export type LinkEndpoint = {
  id: string
  typeKey: string
  name?: string
  key?: string
}

export type LinkCreateRequest = {
  type: string
  direction: LinkDirection
  fromId: string
  toId: string
  values: Json
}

/**
 * Shared confirm step for a link whose ends are already known.
 * Drag-and-drop passes the drop anchor as `source` and every dragged object as `targets`.
 * Several allowed link types show a choice; none shows that the pair is not valid.
 */
export function LinkCreateDialog({
  source,
  target,
  targets,
  defs,
  preferred,
  onClose,
  onConfirm,
  onConfirmMany,
  onReplaced,
}: {
  source: LinkEndpoint
  target: LinkEndpoint
  /** Every object that gets the same link to `source`. Defaults to `target`. */
  targets?: LinkEndpoint[]
  defs?: Json
  preferred?: { linkType: string; direction: LinkDirection }
  onClose: () => void
  /** Resolves when the link is saved or filed. Throw to keep the dialog open. */
  onConfirm: (request: LinkCreateRequest) => Promise<void>
  /** Several dragged objects. A partial result keeps the dialog open for the rest. */
  onConfirmMany?: (requests: LinkCreateRequest[]) => Promise<LinkSubmitResult>
  onReplaced?: (request: LinkCreateRequest) => void
}) {
  const peers = targets && targets.length > 0 ? targets : [target]
  const peerTypes = peers.map((item) => item.typeKey).join('|')
  const choices = useMemo(
    () => linksForEnds(defs, source.typeKey, peerTypes.split('|').filter(Boolean)),
    [defs, source.typeKey, peerTypes],
  )
  if (choices.length === 0) {
    const explanation = linkPairExplanation(defs, source.typeKey, peers.map((item) => item.typeKey))
    return (
      <LinkDialog testId="link-invalid-dialog" title={copy.linkInvalidTitle} onClose={onClose}>
        <div className="create-form">
          <DialogDescription>
            {copy.linkInvalid}{explanation ? ` ${explanation}` : ''}
          </DialogDescription>
          <div className="dialog-actions">
            <button type="button" autoFocus onClick={onClose}>{copy.close}</button>
          </div>
        </div>
      </LinkDialog>
    )
  }
  return (
    <LinkFields
      source={source}
      peers={peers}
      choices={choices}
      defs={defs}
      preferred={preferred}
      onClose={onClose}
      onConfirm={onConfirm}
      onConfirmMany={onConfirmMany}
      onReplaced={onReplaced}
    />
  )
}

function LinkFields({
  source,
  peers,
  choices,
  defs,
  preferred,
  onClose,
  onConfirm,
  onConfirmMany,
  onReplaced,
}: {
  source: LinkEndpoint
  peers: LinkEndpoint[]
  choices: LinkChoice[]
  defs?: Json
  preferred?: { linkType: string; direction: LinkDirection }
  onClose: () => void
  onConfirm: (request: LinkCreateRequest) => Promise<void>
  onConfirmMany?: (requests: LinkCreateRequest[]) => Promise<LinkSubmitResult>
  onReplaced?: (request: LinkCreateRequest) => void
}) {
  const initial = preferredChoice(choices, preferred) ?? choices[0]
  const [selected, setSelected] = useState(initial ? choiceValue(initial) : '')
  const [pending, setPending] = useState(peers)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<{ message: string; request: LinkCreateRequest } | null>(null)
  const [saving, setSaving] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [error, setError] = useState('')
  const choice = choices.find((item) => choiceValue(item) === selected) ?? choices[0]
  useEffect(() => {
    setDraft({})
    setFieldErrors({})
    setConflict(null)
    setError('')
  }, [selected])
  if (!choice) return null
  const summary = linkEndsSummary(source, pending)
  const updateField = (key: string, value: string, invalid = false) => {
    setDraft((state) => ({ ...state, [key]: value }))
    setFieldErrors((state) => {
      if (!invalid && !(key in state)) return state
      const next = { ...state }
      if (invalid) next[key] = copy.linkFieldNumber
      else delete next[key]
      return next
    })
  }
  const applyFieldErrors = (failure: LinkWriteFailure) => {
    const byAttribute = new Map(
      choice.fields.filter((field) => field.attributeId).map((field) => [String(field.attributeId), field.key]),
    )
    const mapped: Record<string, string> = {}
    const rest: string[] = []
    for (const item of failure.fieldErrors ?? []) {
      const key = item.attribute ? byAttribute.get(item.attribute) : undefined
      if (key) mapped[key] = item.message
      else rest.push(item.message)
    }
    if (Object.keys(mapped).length === 0) return false
    setFieldErrors(mapped)
    setConflict(null)
    setError(rest.join(' '))
    return true
  }
  const requestFor = (body: LinkWrite): LinkCreateRequest => {
    const match = pending.find((peer) =>
      body.type === choice.linkType
      && body.from_id === (choice.direction === 'out' ? source.id : peer.id)
      && body.to_id === (choice.direction === 'out' ? peer.id : source.id),
    )
    return match
      ? { type: choice.linkType, direction: choice.direction, fromId: body.from_id, toId: body.to_id, values: body.values }
      : { type: body.type, direction: choice.direction, fromId: body.from_id, toId: body.to_id, values: body.values }
  }
  const showConflict = (failure: LinkWriteFailure, request: LinkCreateRequest) => {
    const peerId = request.fromId === source.id ? request.toId : request.fromId
    const peer = pending.find((item) => item.id === peerId)
    setConflict({
      message: linkCardinalityMessage(defs, choice, source.typeKey, peer?.typeKey ?? ''),
      request,
    })
    setError('')
  }
  const isCardinality = (failure: LinkWriteFailure) =>
    failure.code === 'link_cardinality'
    || (failure.status === 409 && failure.message.includes('allows one link'))
  const submit = () => {
    if (saving || replacing || conflict || pending.length === 0) return
    const errors = linkFieldErrors(choice.fields, draft)
    if (Object.keys(fieldErrors).length > 0 || Object.keys(errors).length > 0) {
      setFieldErrors((state) => ({ ...state, ...errors }))
      setError('')
      return
    }
    const outgoing = choice.direction === 'out'
    const values = linkFieldValues(choice.fields, draft)
    const requests = pending.map((peer) => ({
      type: choice.linkType,
      direction: choice.direction,
      fromId: outgoing ? source.id : peer.id,
      toId: outgoing ? peer.id : source.id,
      values,
    }))
    setSaving(true)
    setError('')
    setFieldErrors({})
    setConflict(null)
    const write = onConfirmMany
      ? onConfirmMany(requests)
      : requests.reduce<Promise<LinkSubmitResult | void>>((chain, request) => chain.then(() => onConfirm(request)), Promise.resolve())
    void write
      .then((result) => {
        if (result && result.outcome === 'partial') {
          const failure = result.failed
          if (applyFieldErrors(failure)) {
            setSaving(false)
            return
          }
          if (isCardinality(failure) && result.created.length === 0) {
            showConflict(failure, requestFor(failure.body))
            setSaving(false)
            return
          }
          const done = new Set(result.created.map((item) => peerId(source.id, item.body)))
          const rest = pending.filter((item) => !done.has(item.id))
          setPending(rest.length > 0 ? rest : pending)
          setSaving(false)
          setError(partialMessage(source.id, result, pending.length, pending))
          return
        }
        onClose()
      })
      .catch((reason: unknown) => {
        setSaving(false)
        const failure = linkFailure(reason, {
          type: choice.linkType,
          from_id: requests[0]?.fromId ?? source.id,
          to_id: requests[0]?.toId ?? source.id,
          values: requests[0]?.values ?? {},
        })
        if (applyFieldErrors(failure)) return
        if (isCardinality(failure)) {
          showConflict(failure, requests[0] ?? requestFor(failure.body))
          return
        }
        setError(failure.message || copy.validation)
      })
  }
  const replace = () => {
    if (!conflict || replacing) return
    const request = conflict.request
    const body: LinkWrite = {
      type: request.type,
      from_id: request.fromId,
      to_id: request.toId,
      values: request.values,
    }
    const peerId = request.fromId === source.id ? request.toId : request.fromId
    const peer = pending.find((item) => item.id === peerId)
    const constrained = linkConstrainedType(choice, source.typeKey, peer?.typeKey ?? '')
    const preferSource = !constrained || constrained.type === source.typeKey
    setReplacing(true)
    setError('')
    void replaceConflictingLink(source.id, body, preferSource)
      .then(() => {
        setReplacing(false)
        onReplaced?.(request)
        const rest = pending.filter((item) => item.id !== peerId)
        if (rest.length > 0) {
          setPending(rest)
          setConflict(null)
          return
        }
        onClose()
      })
      .catch((reason: unknown) => {
        setReplacing(false)
        const failure = linkFailure(reason, body)
        if (applyFieldErrors(failure)) return
        setError(failure.message || copy.validation)
      })
  }
  return (
    <LinkDialog testId="link-create-dialog" title={copy.addLink} onClose={onClose}>
      <form
        className="dialog-form create-form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <div className="create-head">
          <DialogTitle>{copy.addLink}</DialogTitle>
          <div className="link-ends" data-testid="link-ends" data-many={pending.length > 1 ? 'true' : undefined}>
            {pending.length > 1 ? (
              <>
                <span className="link-end">{linkEndLabel(source)}</span>
                {pending.slice(0, 5).map((peer) => (
                  <span className="link-end" key={peer.id}>← {linkEndLabel(peer)}</span>
                ))}
                {pending.length > 5 ? <span className="link-end">{copy.linkMore.replace('{count}', String(pending.length - 5))}</span> : null}
              </>
            ) : (
              <span className="link-end">{summary}</span>
            )}
          </div>
          <DialogDescription className="sr-only">{summary}</DialogDescription>
        </div>
        <div className="create-fields">
          {choices.length > 1 ? (
            <div className="create-field">
              <select
                id="link-type-choice"
                className="link-type-line"
                aria-label={copy.linkType}
                data-testid="link-type-choice"
                autoFocus
                value={choiceValue(choice)}
                onChange={(event) => setSelected(event.target.value)}
              >
                {choices.map((item) => (
                  <option key={choiceValue(item)} value={choiceValue(item)}>{choiceLabel(item, choices)}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="link-type-line" data-testid="link-type-single">{choice.label}</p>
          )}
          {choice.fields.map((field, index) => (
            <div className="create-field" key={field.key}>
              <label htmlFor={`link-field-${field.key}`}>{field.label}</label>
              {field.kind === 'boolean' ? (
                <select
                  id={`link-field-${field.key}`}
                  data-testid={`link-field-${field.key}`}
                  autoFocus={choices.length === 1 && index === 0}
                  value={draft[field.key] ?? ''}
                  onChange={(event) => updateField(field.key, event.target.value)}
                >
                  <option value="">{copy.noValue}</option>
                  <option value="true">{copy.yes}</option>
                  <option value="false">{copy.no}</option>
                </select>
              ) : field.options.length > 0 ? (
                <select
                  id={`link-field-${field.key}`}
                  data-testid={`link-field-${field.key}`}
                  autoFocus={choices.length === 1 && index === 0}
                  value={draft[field.key] ?? ''}
                  onChange={(event) => updateField(field.key, event.target.value)}
                >
                  <option value="">{copy.noValue}</option>
                  {field.options.map((option) => (
                    <option key={option.code} value={option.code}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`link-field-${field.key}`}
                  data-testid={`link-field-${field.key}`}
                  autoFocus={choices.length === 1 && index === 0}
                  type={field.kind === 'date' ? 'date' : 'text'}
                  inputMode={field.kind === 'number' || field.kind === 'range' ? 'decimal' : undefined}
                  data-kind={field.kind === 'number' || field.kind === 'range' ? 'number' : undefined}
                  value={draft[field.key] ?? ''}
                  placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : field.kind === 'number' || field.kind === 'range' ? '0' : undefined}
                  aria-invalid={fieldErrors[field.key] ? true : undefined}
                  onChange={(event) => {
                    const value = event.target.value
                    const invalid = (field.kind === 'number' || field.kind === 'range')
                      && value.trim() !== ''
                      && !Number.isFinite(Number(value.trim()))
                    updateField(field.key, value, invalid)
                  }}
                />
              )}
              {fieldErrors[field.key] ? (
                <p className="error" role="alert" data-testid={`link-field-error-${field.key}`}>{fieldErrors[field.key]}</p>
              ) : null}
            </div>
          ))}
        </div>
        {conflict ? (
          <p className="error" role="alert" data-testid="link-cardinality">{conflict.message}</p>
        ) : null}
        {error ? <p className="error" role="alert" data-testid="link-create-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>{copy.cancel}</button>
          {conflict ? (
            <button type="button" className="primary" data-testid="link-replace" disabled={replacing} onClick={replace}>
              {replacing ? copy.linkReplacing : copy.linkReplace}
            </button>
          ) : (
            <button type="submit" className="primary" data-testid="link-create-confirm" disabled={saving}>{copy.confirm}</button>
          )}
        </div>
      </form>
    </LinkDialog>
  )
}

function peerId(sourceId: string, body: { from_id: string; to_id: string }) {
  return body.from_id === sourceId ? body.to_id : body.from_id
}

function partialMessage(
  sourceId: string,
  result: Extract<LinkSubmitResult, { outcome: 'partial' }>,
  total: number,
  peers: LinkEndpoint[],
) {
  const id = peerId(sourceId, result.failed.body)
  const peer = peers.find((item) => item.id === id)
  return copy.linkedPartial
    .replace('{done}', String(result.created.length))
    .replace('{total}', String(total))
    .replace('{failed}', '1')
    .replace('{name}', peer ? linkEndLabel(peer) : id)
    .replace('{reason}', result.failed.message)
}

function LinkDialog({
  testId,
  title,
  onClose,
  children,
}: {
  testId: string
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => pushLinkUi(), [])
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className="create-dialog"
        data-testid={testId}
        aria-label={title}
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
        }}
      >
        {testId === 'link-invalid-dialog' ? (
          <div className="create-head">
            <DialogTitle>{title}</DialogTitle>
          </div>
        ) : null}
        {children}
      </DialogContent>
    </Dialog>
  )
}
