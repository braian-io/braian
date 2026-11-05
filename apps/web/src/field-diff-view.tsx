import { textValue } from './api'
import type { DiffLine } from './field-diff'

function DiffNew({ value, prefix = '' }: { value: unknown; prefix?: string }) {
  const text = textValue(value)
  return (
    <span className="diff-new" data-testid="diff-new" title={text}>
      {prefix}
      {text}
    </span>
  )
}

/** One changed field per line. Old value is struck through; the new value follows it. */
export function FieldDiff({ lines }: { lines: DiffLine[] }) {
  if (lines.length === 0) return null
  return (
    <ul className="field-diff" data-testid="field-diff">
      {lines.map((line) => (
        <li key={line.id}>
          {line.language ? <span className="lang-chip" data-testid="lang-chip">{line.language}</span> : null}
          <span className="diff-label">{line.label}: </span>
          {line.change === 'add' ? <DiffNew value={line.after} prefix="+ " /> : null}
          {line.change === 'remove' ? <span className="diff-old">{textValue(line.before)}</span> : null}
          {line.change ? null : (
            <>
              {line.before ? <span className="diff-old">{textValue(line.before)}</span> : null}
              {line.before && line.after ? <span className="diff-arrow">{' -> '}</span> : null}
              {line.after ? <DiffNew value={line.after} /> : null}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
