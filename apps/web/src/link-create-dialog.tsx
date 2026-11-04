import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'
import {
  allowedLinks,
  choiceLabel,
  choiceValue,
  linkFieldValues,
  preferredChoice,
  type LinkChoice,
  type LinkDirection,
} from './link-choices'
import { pushLinkUi } from './link-ui'
import { writeErrorMessage } from './write-error'
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
 * Drag-and-drop uses the same dialog: pass the dropped object as `target`.
 * Several allowed link types show a choice; none shows that the pair is not valid.
 */
export function LinkCreateDialog({
  source,
  target,
  defs,
  preferred,
  onClose,
  onConfirm,
}: {
  source: LinkEndpoint
  target: LinkEndpoint
  defs?: Json
  preferred?: { linkType: string; direction: LinkDirection }
  onClose: () => void
  /** Resolves when the link is saved or filed. Throw to keep the dialog open. */
  onConfirm: (request: LinkCreateRequest) => Promise<void>
}) {
  const choices = useMemo(
    () => allowedLinks(defs, source.typeKey, target.typeKey),
    [defs, source.typeKey, target.typeKey],
  )
  if (choices.length === 0) {
    return (
      <LinkDialog testId="link-invalid-dialog" title={copy.linkInvalidTitle} onClose={onClose}>
        <div className="create-form">
          <DialogDescription>{copy.linkInvalid}</DialogDescription>
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
      target={target}
      choices={choices}
      preferred={preferred}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}

function LinkFields({
  source,
  target,
  choices,
  preferred,
  onClose,
  onConfirm,
}: {
  source: LinkEndpoint
  target: LinkEndpoint
  choices: LinkChoice[]
  preferred?: { linkType: string; direction: LinkDirection }
  onClose: () => void
  onConfirm: (request: LinkCreateRequest) => Promise<void>
}) {
  const initial = preferredChoice(choices, preferred) ?? choices[0]
  const [selected, setSelected] = useState(initial ? choiceValue(initial) : '')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const choice = choices.find((item) => choiceValue(item) === selected) ?? choices[0]
  useEffect(() => {
    setDraft({})
    setError('')
  }, [selected])
  if (!choice) return null
  const targetName = target.name || target.key || target.id
  const submit = () => {
    if (saving) return
    const outgoing = choice.direction === 'out'
    const request: LinkCreateRequest = {
      type: choice.linkType,
      direction: choice.direction,
      fromId: outgoing ? source.id : target.id,
      toId: outgoing ? target.id : source.id,
      values: linkFieldValues(choice.fields, draft),
    }
    setSaving(true)
    setError('')
    void onConfirm(request)
      .then(onClose)
      .catch((reason: unknown) => {
        setSaving(false)
        setError(writeErrorMessage(reason) || copy.validation)
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
          <DialogDescription className="hint">{copy.linkToName.replace('{name}', targetName)}</DialogDescription>
        </div>
        <div className="create-fields">
          {choices.length > 1 ? (
            <div className="create-field">
              <label htmlFor="link-type-choice">{copy.linkType}</label>
              <select
                id="link-type-choice"
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
            <p className="hint" data-testid="link-type-single">{choice.label}</p>
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
                  onChange={(event) => setDraft((state) => ({ ...state, [field.key]: event.target.value }))}
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
                  onChange={(event) => setDraft((state) => ({ ...state, [field.key]: event.target.value }))}
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
                  value={draft[field.key] ?? ''}
                  placeholder={field.kind === 'date' ? 'YYYY-MM-DD' : undefined}
                  inputMode={field.kind === 'number' ? 'decimal' : undefined}
                  onChange={(event) => setDraft((state) => ({ ...state, [field.key]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        {error ? <p className="error" role="alert" data-testid="link-create-error">{error}</p> : null}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>{copy.cancel}</button>
          <button type="submit" className="primary" data-testid="link-create-confirm" disabled={saving}>{copy.confirm}</button>
        </div>
      </form>
    </LinkDialog>
  )
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
