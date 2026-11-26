import { useEffect, useRef, useState } from 'react'
import { Button } from './components/ui/button'
import { copy } from './i18n'
import { INLINE_NOTICE_EVENT, type InlineNoticeDetail } from './inline-notice'

const DEFAULT_MS = 6000

/** One quiet banner above the status bar for cross-surface actions (links, model notices, …). */
export function InlineNoticeHost() {
  const [notice, setNotice] = useState<InlineNoticeDetail | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<InlineNoticeDetail>).detail
      if (!detail?.message) return
      if (timer.current) clearTimeout(timer.current)
      setNotice(detail)
      const ms = detail.duration ?? (detail.undo ? 8000 : DEFAULT_MS)
      timer.current = setTimeout(() => setNotice(null), ms)
    }
    window.addEventListener(INLINE_NOTICE_EVENT, open)
    return () => {
      window.removeEventListener(INLINE_NOTICE_EVENT, open)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  if (!notice) return null
  return (
    <div
      className={`inline-notice${notice.error ? ' inline-notice-error' : ''}`}
      data-testid="inline-action-notice"
      role="status"
      aria-live="polite"
    >
      <span data-testid="inline-action-notice-text">{notice.message}</span>
      {notice.undo ? (
        <Button
          type="button"
          variant="ghost"
          className="inline-notice-action"
          data-testid="inline-action-notice-undo"
          onClick={() => {
            notice.undo?.onClick()
            setNotice(null)
          }}
        >
          {notice.undo.label}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        className="inline-notice-dismiss"
        aria-label={copy.close}
        onClick={() => setNotice(null)}
      >
        ×
      </Button>
    </div>
  )
}