import { useState, type MouseEvent } from 'react'
import { textValue } from './api'
import type { DiffLine } from './field-diff'
import { copy } from './i18n'

const DIFF_PREVIEW_CHARS = 96

function stopArticleToggle(event: MouseEvent) {
  event.stopPropagation()
}

function DiffValue({
  text,
  className,
  testId,
  compact,
}: {
  text: string
  className: string
  testId?: string
  compact: boolean
}) {
  const [open, setOpen] = useState(false)
  const collapsible = compact && text.length > DIFF_PREVIEW_CHARS
  const visible = collapsible && !open ? `${text.slice(0, DIFF_PREVIEW_CHARS)}…` : text
  return (
    <span className={className} data-testid={testId} title={collapsible ? text : undefined}>
      {visible}
      {collapsible ? (
        <button
          type="button"
          className="diff-value-expand"
          data-testid="diff-expand"
          onClick={(event) => {
            stopArticleToggle(event)
            setOpen((value) => !value)
          }}
        >
          {open ? copy.collapse : copy.expand}
        </button>
      ) : null}
    </span>
  )
}

function DiffNew({
  value,
  prefix = '',
  compact,
}: {
  value: unknown
  prefix?: string
  compact: boolean
}) {
  const text = textValue(value)
  return (
    <>
      {prefix}
      <DiffValue text={text} className="diff-new" testId="diff-new" compact={compact} />
    </>
  )
}

/** One changed field per line. Old value is struck through; the new value follows it. */
export function FieldDiff({ lines, compact = false }: { lines: DiffLine[]; compact?: boolean }) {
  if (lines.length === 0) return null
  return (
    <ul className="field-diff" data-testid="field-diff">
      {lines.map((line) => (
        <li key={line.id}>
          {line.language ? <span className="lang-chip" data-testid="lang-chip">{line.language}</span> : null}
          <span className="diff-label">{line.label}: </span>
          {line.change === 'add' ? <DiffNew value={line.after} prefix="+ " compact={compact} /> : null}
          {line.change === 'remove' ? (
            <DiffValue text={textValue(line.before)} className="diff-old" compact={compact} />
          ) : null}
          {line.change ? null : (
            <>
              {line.before ? (
                <DiffValue text={textValue(line.before)} className="diff-old" compact={compact} />
              ) : null}
              {line.before && line.after ? <span className="diff-arrow">{' -> '}</span> : null}
              {line.after ? <DiffNew value={line.after} compact={compact} /> : null}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}