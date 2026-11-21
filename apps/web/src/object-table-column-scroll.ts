/** Left edge of the horizontal scrollport; widened by any stuck leading sticky column cells. */
export function stickyLeadingInset(grid: HTMLElement): number {
  const gridRect = grid.getBoundingClientRect()
  let inset = 0
  for (const cell of grid.querySelectorAll<HTMLElement>('.head .cell, .row .cell')) {
    const style = getComputedStyle(cell)
    if (style.position !== 'sticky') continue
    const stickLeft = Number.parseFloat(style.left) || 0
    if (stickLeft > 0.5) continue
    const rect = cell.getBoundingClientRect()
    if (Math.abs(rect.left - (gridRect.left + stickLeft)) > 2) continue
    inset = Math.max(inset, rect.right - gridRect.left)
  }
  return inset
}

export function activeObjectTableCell(grid: HTMLElement): HTMLElement | null {
  const row =
    grid.querySelector<HTMLElement>('.row.active .cell.active-cell, .row.selected .cell.active-cell')
      ?.closest<HTMLElement>('.row')
    ?? grid.querySelector<HTMLElement>('.cell.active-cell')?.closest<HTMLElement>('.row')
  if (!row) return null
  return row.querySelector<HTMLElement>('.cell.active-cell')
}

/** Keep the keyboard-active column fully inside the grid's horizontal scrollport. */
export function scrollObjectTableActiveColumn(grid: HTMLElement | null | undefined): void {
  if (!grid) return
  const cell = activeObjectTableCell(grid)
  if (!cell) return
  const gridRect = grid.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  const inset = stickyLeadingInset(grid)
  const visibleLeft = gridRect.left + inset
  const visibleRight = gridRect.right
  let scrollDelta = 0
  if (cellRect.left < visibleLeft - 0.5) {
    scrollDelta = cellRect.left - visibleLeft
  } else if (cellRect.right > visibleRight + 0.5) {
    scrollDelta = cellRect.right - visibleRight
  }
  if (scrollDelta !== 0) grid.scrollLeft += scrollDelta
}