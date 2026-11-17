const LIST_NAV_KEYS = new Set([
  'ArrowDown',
  'ArrowUp',
  'PageDown',
  'PageUp',
  'Home',
  'End',
])

export function isPaletteListNavKey(key: string): boolean {
  return LIST_NAV_KEYS.has(key)
}

/** Keys that change level or the active row without using ArrowDown/Up. */
export function isPaletteListTransitionKey(key: string): boolean {
  return (
    isPaletteListNavKey(key)
    || key === 'ArrowRight'
    || key === 'ArrowLeft'
    || key === 'Backspace'
    || key === 'Enter'
  )
}

/** Keep the active row inside a scrollable palette list; adjust scrollTop only when needed. */
export function scrollPaletteActiveItem(list: HTMLElement | null | undefined): void {
  if (!list) return
  const item =
    list.querySelector<HTMLElement>('.hit.on, .fields-hit-active, [data-active="true"]') ?? null
  if (!item) return
  const listRect = list.getBoundingClientRect()
  const itemRect = item.getBoundingClientRect()
  if (itemRect.top < listRect.top) {
    list.scrollTop -= listRect.top - itemRect.top
  } else if (itemRect.bottom > listRect.bottom) {
    list.scrollTop += itemRect.bottom - listRect.bottom
  }
}