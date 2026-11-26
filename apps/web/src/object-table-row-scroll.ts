export type ObjectTableRowScrollDirection = 'up' | 'down' | 'nearest'

/** Visible body top inside a `.grid` scrollport, below the sticky header row. */
export function objectTableBodyViewport(grid: HTMLElement): { top: number; bottom: number } {
  const gridRect = grid.getBoundingClientRect()
  const head = grid.querySelector<HTMLElement>('.head')
  const headBottom = head?.getBoundingClientRect().bottom ?? gridRect.top
  return { top: headBottom, bottom: gridRect.bottom }
}

export function activeObjectTableRow(grid: HTMLElement): HTMLElement | null {
  const id = grid.getAttribute('aria-activedescendant')
  if (id) return document.getElementById(id) as HTMLElement | null
  return (
    grid.querySelector<HTMLElement>(
      '[data-testid="object-row"].active, [data-testid="object-row"].selected',
    ) ?? null
  )
}

/** Keep the active object row fully visible; scroll minimally for arrow direction. */
export function scrollObjectTableActiveRow(
  grid: HTMLElement | null | undefined,
  direction: ObjectTableRowScrollDirection = 'nearest',
): void {
  if (!grid) return
  const row = activeObjectTableRow(grid)
  if (!row) return
  const viewport = objectTableBodyViewport(grid)
  const rowRect = row.getBoundingClientRect()

  if (direction === 'down' || direction === 'nearest') {
    if (rowRect.bottom > viewport.bottom + 0.5) {
      grid.scrollTop += rowRect.bottom - viewport.bottom
    } else if (direction === 'nearest' && rowRect.top < viewport.top - 0.5) {
      grid.scrollTop -= viewport.top - rowRect.top
    }
  }
  if (direction === 'up' || direction === 'nearest') {
    if (rowRect.top < viewport.top - 0.5) {
      grid.scrollTop -= viewport.top - rowRect.top
    } else if (direction === 'nearest' && rowRect.bottom > viewport.bottom + 0.5) {
      grid.scrollTop += rowRect.bottom - viewport.bottom
    }
  }
}