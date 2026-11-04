import type { ReactNode } from 'react'

export function StateNote({
  tone,
  title,
  detail,
  action,
  className,
  testId,
}: {
  tone: 'empty' | 'loading' | 'error'
  title: string
  detail?: string
  action?: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <div
      className={`state state-${tone}${className ? ` ${className}` : ''}`}
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId ?? `state-${tone}`}
    >
      {tone === 'error' ? (
        <span className="state-mark" aria-hidden="true">
          !
        </span>
      ) : null}
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
      {action}
    </div>
  )
}
