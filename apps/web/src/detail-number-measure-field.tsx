import { useCallback, useEffect, useRef, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { copy } from './i18n'
import {
  commitDetailMeasureDraft,
  detailMeasureCommittedText,
  flushDetailMeasureDraft,
  type MeasureFieldRecord,
} from './detail-measure-commit'
import { useDetailFieldDraft } from './detail-field-draft'

function UnitSuffix({ units, value, onChange }: { units: string[]; value: string; onChange: (unit: string) => void }) {
  if (units.length === 0) return null
  if (units.length === 1) return <span className="meta-chip">{units[0]}</span>
  return (
    <Select value={value || units[0]} onValueChange={onChange}>
      <SelectTrigger className="unit-suffix" data-field="true" aria-label={copy.unit}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function DetailNumberMeasureField({
  fieldKey,
  value,
  units,
  onChange,
}: {
  fieldKey: string
  value: unknown
  units: string[]
  onChange: (value: unknown) => void
}) {
  const record = (value && typeof value === 'object' ? value : { value }) as MeasureFieldRecord
  const committedText = detailMeasureCommittedText(record)
  const [draft, setDraft] = useState(committedText)
  const [invalid, setInvalid] = useState(false)
  const skipBlurCommitRef = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const recordRef = useRef(record)
  recordRef.current = record
  const valueStamp = `${String(record.value ?? '')}\0${String(record.unit ?? '')}`
  useEffect(() => {
    setDraft(committedText)
    setInvalid(false)
  }, [valueStamp, committedText])

  const clearSkipBlur = useCallback(() => {
    skipBlurCommitRef.current = false
  }, [])

  const applyCommit = useCallback((text: string, mode: 'blur' | 'flush') => {
    if (mode === 'flush') {
      const result = flushDetailMeasureDraft(text, recordRef.current)
      if (!result.ok) {
        setInvalid(true)
        return false
      }
      setInvalid(false)
      if (result.kind === 'committed') {
        onChange(result.next)
        setDraft(result.displayText)
      }
      return true
    }
    const result = commitDetailMeasureDraft(text, recordRef.current, 'blur')
    if (!result.ok) {
      setInvalid(true)
      return false
    }
    setInvalid(false)
    if (result.kind === 'committed') onChange(result.next)
    setDraft(result.displayText)
    return true
  }, [onChange])

  const commitForSave = useCallback(() => applyCommit(draftRef.current, 'flush'), [applyCommit])
  const discardLocal = useCallback(() => {
    skipBlurCommitRef.current = true
    setDraft(committedText)
    setInvalid(false)
  }, [committedText])

  useDetailFieldDraft({ commit: commitForSave, discard: discardLocal })

  return (
    <span className="measure" data-testid={`detail-measure-field-${fieldKey}`}>
      <input
        data-field="true"
        data-testid="detail-measure-value"
        value={draft}
        title={draft}
        aria-invalid={invalid || undefined}
        onFocus={clearSkipBlur}
        onChange={(event) => {
          clearSkipBlur()
          setInvalid(false)
          setDraft(event.target.value)
        }}
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false
            return
          }
          applyCommit(draft, 'blur')
        }}
      />
      <UnitSuffix
        units={units}
        value={String(record.unit ?? units[0] ?? '')}
        onChange={(unit) => {
          skipBlurCommitRef.current = true
          setInvalid(false)
          onChange({ ...record, unit })
        }}
      />
    </span>
  )
}