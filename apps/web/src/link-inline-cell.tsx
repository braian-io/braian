import { useEffect, useState } from 'react'
import { api } from './api'
import { copy } from './i18n'
import { filterIntegerInput, linkFieldErrors, linkFieldValues, type LinkField } from './link-choices'
import { linkFailure } from './link-write'
import { reportWriteError } from './write-error'

export function LinkInlineCell({
  linkId,
  version,
  field,
  value,
  linkType,
  onSaved,
}: {
  linkId: string
  version: number
  field: LinkField
  value: string
  linkType: string
  onSaved: () => void
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(value)
  }, [value])

  const commit = () => {
    if (saving || draft === value) return
    const errors = linkFieldErrors([field], { [field.key]: draft })
    if (errors[field.key]) {
      setError(errors[field.key] ?? '')
      return
    }
    if (!Number.isFinite(version) || version <= 0) return
    setSaving(true)
    setError('')
    void api.patch('/v1/links/{id}', {
      params: { path: { id: linkId }, header: { 'If-Match': version } },
      body: { values: linkFieldValues([field], { [field.key]: draft }) },
    }).then(() => {
      onSaved()
    }).catch((reason: unknown) => {
      const failure = linkFailure(reason, { type: linkType, from_id: '', to_id: '', values: {} })
      setError(failure.fieldErrors?.[0]?.message ?? failure.message)
      reportWriteError(reason)
    }).finally(() => {
      setSaving(false)
    })
  }

  return (
    <label className="link-inline-field">
      <span className="link-inline-label">{field.label}</span>
      <input
        className="link-inline-input"
        data-testid={`link-inline-${field.key}`}
        type="text"
        inputMode={field.integer ? 'numeric' : field.kind === 'number' ? 'decimal' : undefined}
        data-kind={field.kind === 'number' || field.kind === 'range' ? 'number' : undefined}
        value={draft}
        disabled={saving}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const next = field.integer ? filterIntegerInput(event.target.value) : event.target.value
          setDraft(next)
          setError('')
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(value)
            setError('')
            ;(event.target as HTMLInputElement).blur()
          }
        }}
      />
      {error ? <span className="error link-inline-error" role="alert">{error}</span> : null}
    </label>
  )
}