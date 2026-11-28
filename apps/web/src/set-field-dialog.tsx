import { useEffect, useRef, useState } from 'react'
import type { Json } from './api'
import { BulkWriteConfirm } from './bulk-write'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Switch } from './components/ui/switch'
import { copy } from './i18n'
import {
  emptySetFieldDraft,
  setFieldConfirmMessage,
  setFieldFailureMessage,
  setFieldNeedsConfirm,
  setFieldNextValue,
  setFieldValueError,
  setFieldValues,
  type SetFieldChoice,
  type SetFieldDraft,
  type SetFieldWriteResult,
} from './set-field'
import { writeErrorMessage } from './write-error'

export function SetFieldFlow({
  open,
  count,
  choices,
  language,
  noun,
  onClose,
  onWrite,
}: {
  open: boolean
  count: number
  choices: SetFieldChoice[]
  language: string
  noun: string
  onClose: () => void
  onWrite: (values: Json) => Promise<SetFieldWriteResult>
}) {
  const [phase, setPhase] = useState<'edit' | 'confirm'>('edit')
  const [key, setKey] = useState('')
  const [draft, setDraft] = useState<SetFieldDraft>(emptySetFieldDraft())
  const [pending, setPending] = useState<{ label: string; values: Json } | null>(null)
  const [error, setError] = useState('')
  const [writing, setWriting] = useState(false)
  const writingRef = useRef(false)
  const opened = useRef(false)

  useEffect(() => {
    if (!open) {
      opened.current = false
      return
    }
    if (opened.current) return
    opened.current = true
    setPhase('edit')
    setError('')
    setPending(null)
    setWriting(false)
    const first = choices[0]
    setKey(first?.key ?? '')
    setDraft(emptySetFieldDraft(first))
  }, [open, choices])

  useEffect(() => {
    if (!open || key) return
    const first = choices[0]
    if (!first) return
    setKey(first.key)
    setDraft(emptySetFieldDraft(first))
  }, [open, choices, key])

  const choice = choices.find((item) => item.key === key) ?? choices[0]

  const selectField = (nextKey: string) => {
    const next = choices.find((item) => item.key === nextKey)
    setKey(nextKey)
    setDraft(emptySetFieldDraft(next))
    setError('')
  }

  const write = async (values: Json) => {
    if (writingRef.current) return
    writingRef.current = true
    setWriting(true)
    setError('')
    try {
      const result = await onWrite(values)
      if (result.failed.length > 0) {
        setError(setFieldFailureMessage(result.failed, result.applied.length))
        setPhase('edit')
        return
      }
      onClose()
    } catch (reason) {
      setError(writeErrorMessage(reason) ?? copy.saveFailed)
      setPhase('edit')
    } finally {
      writingRef.current = false
      setWriting(false)
    }
  }

  const apply = () => {
    if (!choice || writingRef.current || count < 1) return
    const next = setFieldNextValue(choice, draft, language)
    const problem = setFieldValueError(choice, next)
    if (problem) {
      setError(problem)
      return
    }
    const values = setFieldValues(choice.key, next)
    setError('')
    if (setFieldNeedsConfirm(count)) {
      setPending({ label: choice.label, values })
      setPhase('confirm')
      return
    }
    void write(values)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next && !writingRef.current) onClose() }}>
        <DialogContent data-testid="set-field-dialog" aria-label={copy.setField}>
          <DialogTitle>{copy.setField}</DialogTitle>
          <DialogDescription>{copy.setFieldHint}</DialogDescription>
          <form
            className="dialog-form"
            onSubmit={(event) => {
              event.preventDefault()
              apply()
            }}
          >
            {choices.length === 0 ? <p className="hint">{copy.setFieldNone}</p> : (
              <>
                <label>
                  {copy.setFieldAttribute}
                  <select
                    data-testid="set-field-attribute"
                    value={choice?.key ?? ''}
                    onChange={(event) => selectField(event.target.value)}
                  >
                    {choices.map((item) => (
                      <option key={item.key} value={item.key}>{item.label}</option>
                    ))}
                  </select>
                </label>
                {choice ? (
                  <SetFieldValue
                    choice={choice}
                    draft={draft}
                    onDraft={setDraft}
                  />
                ) : null}
              </>
            )}
            {error ? <p className="error" role="alert" data-testid="set-field-error">{error}</p> : null}
            <div className="dialog-actions">
              <Button type="button" variant="ghost" onClick={onClose} disabled={writing}>{copy.cancel}</Button>
              <Button type="submit" variant="primary" data-testid="set-field-apply" disabled={writing || choices.length === 0 || count < 1}>
                {copy.setField}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <BulkWriteConfirm
        open={open && phase === 'confirm'}
        field={pending?.label ?? choice?.label ?? ''}
        count={count}
        title={copy.setField}
        impact={setFieldConfirmMessage(pending?.label ?? choice?.label ?? '', count, noun)}
        onCancel={() => {
          if (writingRef.current) return
          setPhase('edit')
        }}
        onConfirm={() => {
          if (!pending || writingRef.current) return
          void write(pending.values)
        }}
      />
    </>
  )
}

function SetFieldValue({
  choice,
  draft,
  onDraft,
}: {
  choice: SetFieldChoice
  draft: SetFieldDraft
  onDraft: (draft: SetFieldDraft) => void
}) {
  if (choice.kind === 'boolean') {
    return (
      <label>
        {copy.setFieldValue}
        <Switch
          data-testid="set-field-value"
          checked={draft.checked}
          aria-label={choice.label}
          onCheckedChange={(checked) => onDraft({ ...draft, checked })}
        />
      </label>
    )
  }
  if (choice.kind === 'value_list' && choice.multiple) {
    return (
      <div className="choices" data-testid="set-field-value">
        {choice.options.map((option) => {
          const on = draft.codes.includes(option.value)
          return (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              className={on ? 'choice-chip on' : 'choice-chip'}
              aria-pressed={on}
              onClick={() => onDraft({
                ...draft,
                codes: on ? draft.codes.filter((code) => code !== option.value) : [...draft.codes, option.value],
              })}
            >
              {option.label}
            </Button>
          )
        })}
      </div>
    )
  }
  if (choice.kind === 'value_list') {
    return (
      <label>
        {copy.setFieldValue}
        <Select value={draft.text || undefined} onValueChange={(value) => onDraft({ ...draft, text: value })}>
          <SelectTrigger data-testid="set-field-value" aria-label={choice.label}>
            <SelectValue placeholder={copy.noValue} />
          </SelectTrigger>
          <SelectContent>
            {choice.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    )
  }
  if (choice.kind === 'range') {
    return (
      <span className="measure">
        <input
          data-testid="set-field-min"
          aria-label={`${choice.label} min`}
          value={draft.min}
          onChange={(event) => onDraft({ ...draft, min: event.target.value })}
        />
        <input
          data-testid="set-field-max"
          aria-label={`${choice.label} max`}
          value={draft.max}
          onChange={(event) => onDraft({ ...draft, max: event.target.value })}
        />
        <UnitSelect choice={choice} draft={draft} onDraft={onDraft} />
      </span>
    )
  }
  return (
    <label>
      {copy.setFieldValue}
      {choice.form === 'long' ? (
        <textarea
          data-testid="set-field-value"
          aria-label={choice.label}
          value={draft.text}
          onChange={(event) => onDraft({ ...draft, text: event.target.value })}
        />
      ) : (
        <span className="measure">
          <input
            data-testid="set-field-value"
            aria-label={choice.label}
            type={choice.kind === 'date' ? 'date' : 'text'}
            value={draft.text}
            onChange={(event) => onDraft({ ...draft, text: event.target.value })}
          />
          {choice.kind === 'number' ? <UnitSelect choice={choice} draft={draft} onDraft={onDraft} /> : null}
        </span>
      )}
    </label>
  )
}

function UnitSelect({
  choice,
  draft,
  onDraft,
}: {
  choice: SetFieldChoice
  draft: SetFieldDraft
  onDraft: (draft: SetFieldDraft) => void
}) {
  if (choice.units.length === 0) return null
  if (choice.units.length === 1) return <span className="meta-chip">{choice.units[0]}</span>
  return (
    <select
      data-testid="set-field-unit"
      aria-label={copy.unit}
      value={draft.unit || choice.units[0]}
      onChange={(event) => onDraft({ ...draft, unit: event.target.value })}
    >
      {choice.units.map((unit) => (
        <option key={unit} value={unit}>{unit}</option>
      ))}
    </select>
  )
}
