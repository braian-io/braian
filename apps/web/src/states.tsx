export function StateNote({
  tone,
  title,
  detail,
  testId,
}: {
  tone: 'empty' | 'loading' | 'error'
  title: string
  detail?: string
  testId?: string
}) {
  return (
    <div className={`state state-${tone}`} data-testid={testId ?? `state-${tone}`}>
      {tone === 'error' ? (
        <span className="state-mark" aria-hidden="true">
          !
        </span>
      ) : null}
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  )
}
