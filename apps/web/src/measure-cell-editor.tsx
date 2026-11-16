import type { KeyboardEvent } from 'react'
import { copy } from './i18n'
import { formatUnitCode } from './format'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'

export type MeasureCellEditorProps = {
  columnId: string
  valueText: string
  unit: string
  unitLocked: boolean
  unitOptions: string[]
  invalid?: boolean
  onValueTextChange: (text: string) => void
  onUnitChange: (unit: string) => void
  onCommit: () => void
  onCancel: () => void
}

export function MeasureCellEditor({
  columnId,
  valueText,
  unit,
  unitLocked,
  unitOptions,
  invalid,
  onValueTextChange,
  onUnitChange,
  onCommit,
  onCancel,
}: MeasureCellEditorProps) {
  const handleKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      onCommit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <span
      className="measure cell-measure-editor"
      data-testid={`cell-editor-${columnId}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <input
        className={invalid ? 'cell-editor cell-editor-invalid' : 'cell-editor'}
        data-testid={`cell-editor-${columnId}-value`}
        autoFocus
        value={valueText}
        aria-invalid={invalid || undefined}
        aria-label={copy.number}
        onChange={(event) => onValueTextChange(event.target.value)}
        onBlur={() => onCommit()}
      />
      {unitLocked || unitOptions.length <= 1 ? (
        <span className="meta-chip cell-editor-unit" data-testid={`cell-editor-${columnId}-unit`}>
          {formatUnitCode(unit)}
        </span>
      ) : (
        <Select value={unit || unitOptions[0]} onValueChange={onUnitChange}>
          <SelectTrigger
            className="unit-suffix cell-editor-unit-trigger"
            data-testid={`cell-editor-${columnId}-unit`}
            aria-label={copy.unit}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((option) => (
              <SelectItem key={option} value={option}>{formatUnitCode(option)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </span>
  )
}