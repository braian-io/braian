import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Render a fixed overlay at the top level of the document.
 *
 * A pane paints inside its own isolation context (`isolation: isolate` plus
 * `overflow: hidden`), so a `position: fixed` palette mounted from a pane is
 * both clipped and stacked under its neighbours. Portalling to `document.body`
 * puts it above every pane while the theme variables on `:root` still apply.
 */
export function Portal({ children, container }: { children: ReactNode; container?: Element | DocumentFragment | null }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, container ?? document.body)
}
