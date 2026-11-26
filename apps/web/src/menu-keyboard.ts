const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Visible, inert-skipping tab stops in document order (WAI-ARIA menu Tab dismiss). */
function tabStopVisible(element: HTMLElement) {
  if (element.closest('[inert], [aria-hidden="true"]')) return false
  if (element.getClientRects().length > 0) return true
  // jsdom renders no layout; still treat connected native controls as tab stops.
  return element.isConnected && (element.tagName === 'BUTTON' || element.tagName === 'A' || element.tagName === 'INPUT')
}

export function tabStopsInDocument(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(tabStopVisible)
}

/** After Tab / Shift+Tab in a menu, move focus to the next or previous tab stop after the trigger. */
export function focusAfterMenuTab(trigger: HTMLElement, backward: boolean) {
  const stops = tabStopsInDocument()
  const index = stops.indexOf(trigger)
  if (index < 0) return
  const next = backward ? stops[index - 1] : stops[index + 1]
  next?.focus({ preventScroll: true })
}