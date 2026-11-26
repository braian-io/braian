import { useEffect, useMemo, useState } from 'react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog'
import { api, type Json } from './api'
import { copy } from './i18n'
import { LinkAttributeFields } from './link-field-inputs'
import { linkDraftFromItem, linkFieldErrors, linkFieldValues, linkTypeFields, type LinkField } from './link-choices'
import { linkFailure, type LinkWriteFailure } from './link-write'
import { pushLinkUi } from './link-ui'
import { acknowledgeWriteError } from './write-status'
import { writeErrorMessage } from './write-error'

type LinkEditItem = {
  id: string
  peer_key: string
  version?: number
  sort_order?: string | number | null
  values?: Json
}

export function LinkEditDialog({
  link,
  linkType,
  defs,
  onClose,
  onSaved,
}: {
  link: LinkEditItem
  linkType: string
  defs?: Json
  onClose: () => void
  onSaved: () => void
}) {
  const fields = useMemo(() => linkTypeFields(defs, linkType), [defs, linkType])
  const [draft, setDraft] = useState(() => linkDraftFromItem(fields, link))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => pushLinkUi(), [])

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

  const applyFieldErrors = (failure: LinkWriteFailure, fieldList: LinkField[]) => {
    const byAttribute = new Map(
      fieldList.filter((field) => field.attributeId).map((field) => [String(field.attributeId), field.key]),
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
    setError(rest.join(' '))
    acknowledgeWriteError(failure.status)
    return true
  }

  const save = () => {
    if (saving || fields.length === 0) return
    const errors = linkFieldErrors(fields, draft)
    if (Object.keys(fieldErrors).length > 0 || Object.keys(errors).length > 0) {
      setFieldErrors((state) => ({ ...state, ...errors }))
      setError('')
      return
    }
    const version = Number(link.version)
    if (!Number.isFinite(version) || version <= 0) {
      setError(copy.validation)
      return
    }
  setSaving(true)
    setError('')
    void api.patch('/v1/links/{id}', {
      params: { path: { id: link.id }, header: { 'If-Match': version } },
      body: { values: linkFieldValues(fields, draft) },
    }).then(() => {
      onSaved()
      onClose()
    }).catch((reason: unknown) => {
      const failure = linkFailure(reason, {
        type: linkType,
        from_id: '',
        to_id: '',
        values: linkFieldValues(fields, draft),
      })
      if (!applyFieldErrors(failure, fields)) {
        setError(writeErrorMessage(reason) || failure.message)
        acknowledgeWriteError(failure.status)
      }
    }).finally(() => {
      setSaving(false)
    })
  }

  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        className="create-dialog"
        data-testid="link-edit-dialog"
        aria-label={copy.editLink}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <div className="create-head">
          <DialogTitle>{copy.editLink}</DialogTitle>
          <p className="link-type-line" data-testid="link-edit-peer">{link.peer_key}</p>
        </div>
        <form className="create-form" onSubmit={(event) => { event.preventDefault(); save() }}>
          <LinkAttributeFields
            fields={fields}
            draft={draft}
            fieldErrors={fieldErrors}
            onFieldChange={updateField}
            autoFocusFirst
          />
          {error ? <p className="error" role="alert" data-testid="link-edit-error">{error}</p> : null}
          <div className="dialog-actions">
            <Button type="button" variant="default" onClick={onClose}>{copy.cancel}</Button>
            <Button type="submit" variant="primary" data-testid="link-edit-save" disabled={saving}>{copy.save}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
