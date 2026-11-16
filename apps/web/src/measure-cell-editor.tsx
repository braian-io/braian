import type { KeyboardEvent, MouseEvent } from 'react'
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
  /** Commit or cancel after focus leaves the editor (blur / Tab). */
  onValueBlur?: () => void
  /** Fires when the unit dropdown opens or closes so the parent can ignore input blur. */
  onUnitSelectorOpen?: () => void
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
  onValueBlur,
  onUnitSelectorOpen,
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
    if (event.key === 'Tab') {
      event.preventDefault()
      onCommit()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  const blockInputBlur = (event: MouseEvent) => {
    event.preventDefault()
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
        onKeyDown={(event) => event.stopPropagation()}
        onBlur={() => onValueBlur?.()}
      />
      {unitLocked || unitOptions.length <= 1 ? (
        <span className="meta-chip cell-editor-unit" data-testid={`cell-editor-${columnId}-unit`}>
          {formatUnitCode(unit)}
        </span>
      ) : (
        <Select
          value={unit || unitOptions[0]}
          onValueChange={onUnitChange}
          onOpenChange={(open) => {
            onUnitSelectorOpen?.()
            if (!open) {
              window.setTimeout(() => onUnitSelectorOpen?.(), 0)
            }
          }}
        >
          <SelectTrigger
            className="unit-suffix cell-editor-unit-trigger"
            data-testid={`cell-editor-${columnId}-unit`}
            aria-label={copy.unit}
            onPointerDown={blockInputBlur}
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