/** Transient inline feedback at the place of an action (no success toasts). */

export type InlineNoticeDetail = {
  message: string
  undo?: { label: string; onClick: () => void }
  error?: boolean
  duration?: number
}

export const INLINE_NOTICE_EVENT = 'braian-inline-notice'

export function publishInlineNotice(detail: InlineNoticeDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<InlineNoticeDetail>(INLINE_NOTICE_EVENT, { detail }))
}