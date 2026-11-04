import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'
import { writeErrorMessage } from './write-error'

export type CreateDialogField = {
  id: string
  label: string
  value: string
  testId: string
  autoFocus?: boolean
  options?: Array<{ value: string; label: string }>
}

/**
 * Modal create form. Uses the shared Dialog primitive (Radix), which traps
 * focus and returns it to the control that was focused when the dialog opened.
 */
export function CreateDialog({
  open,
  title,
  description,
  fields,
  dialogTestId = 'create-dialog',
  submitTestId = 'create-object',
  onField,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  description: string
  fields: CreateDialogField[]
  dialogTestId?: string
  submitTestId?: string
  onField: (id: string, value: string) => void
  onClose: () => void
  /** Resolves when the row is saved. Throw to keep the dialog open and show the message. */
  onSubmit: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setError('')
      setSaving(false)
    }
    wasOpen.current = open
  }, [open])

  const close = () => {
    generation.current += 1
    setSaving(false)
    setError('')
    onClose()
  }

  const submit = () => {
    if (saving) return
    const token = generation.current
    setSaving(true)
    setError('')
    void onSubmit()
      .then(() => {
        if (generation.current !== token) return
        setSaving(false)
        onClose()
      })
      .catch((reason: unknown) => {
        if (generation.current !== token) return
        setSaving(false)
        setError(writeErrorMessage(reason) || copy.validation)
      })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close() }}>
      {open ? (
      <DialogContent
        className="create-dialog"
        data-testid={dialogTestId}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <form
          className="dialog-form create-form"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="create-head">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="hint">{description}</DialogDescription>
          </div>
          <div className="create-fields">
            {fields.map((field, index) => {
              const inputId = `${dialogTestId}-${field.id}`
              const focus = field.autoFocus || (index === 0 && !fields.some((item) => item.autoFocus))
              return (
                <div className="create-field" key={field.id}>
                  <label htmlFor={inputId}>{field.label}</label>
                  {field.options ? (
                    <select
                      id={inputId}
                      data-testid={field.testId}
                      autoFocus={focus}
                      value={field.value}
                      onChange={(event) => onField(field.id, event.target.value)}
                    >
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={inputId}
                      data-testid={field.testId}
                      autoFocus={focus}
                      value={field.value}
                      onChange={(event) => onField(field.id, event.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {error ? (
            <p className="error" role="alert" data-testid="validation-error">{error}</p>
          ) : null}
          <div className="dialog-actions">
            <button type="button" data-testid="create-cancel" onClick={close}>{copy.cancel}</button>
            <button type="submit" className="primary" data-testid={submitTestId} disabled={saving}>{copy.save}</button>
          </div>
        </form>
      </DialogContent>
      ) : null}
    </Dialog>
  )
}

export function requireText(value: string | undefined) {
  const text = value?.trim() ?? ''
  if (!text) throw new Error(copy.validation)
  return text
}
