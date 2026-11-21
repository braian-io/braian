function cellInScrollContent(grid: HTMLElement, cell: HTMLElement): { left: number; width: number } {
  const gridRect = grid.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  return {
    left: cellRect.left - gridRect.left + grid.scrollLeft,
    width: cellRect.width,
  }
}

/** Width of leading sticky column cells in the first body row (when scrolled). */
export function stickyLeadingInset(grid: HTMLElement): number {
  if (grid.scrollLeft <= 0) return 0
  const row = grid.querySelector<HTMLElement>('.row') ?? grid.querySelector<HTMLElement>('.head')
  if (!row) return 0
  let inset = 0
  for (const cell of row.querySelectorAll<HTMLElement>('.cell')) {
    const style = getComputedStyle(cell)
    if (style.position !== 'sticky') break
    const stickLeft = Number.parseFloat(style.left) || 0
    if (stickLeft > 0.5) break
    inset += cell.getBoundingClientRect().width
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

/** True when the active cell's layout box sits inside the grid scrollport (for tests). */
export function isActiveObjectTableColumnVisible(grid: HTMLElement): boolean {
  const cell = activeObjectTableCell(grid)
  if (!cell) return false
  const inset = stickyLeadingInset(grid)
  const { left: cellLeft, width } = cellInScrollContent(grid, cell)
  const cellRight = cellLeft + width
  const viewLeft = grid.scrollLeft + inset
  const viewRight = grid.scrollLeft + grid.clientWidth
  return cellLeft >= viewLeft - 1 && cellRight <= viewRight + 1
}

/** Keep the keyboard-active column fully inside the grid's horizontal scrollport. */
export function scrollObjectTableActiveColumn(grid: HTMLElement | null | undefined): void {
  if (!grid) return
  const cell = activeObjectTableCell(grid)
  if (!cell) return
  const inset = stickyLeadingInset(grid)
  const { left: cellLeft, width } = cellInScrollContent(grid, cell)
  const cellRight = cellLeft + width
  const viewLeft = grid.scrollLeft + inset
  const viewRight = grid.scrollLeft + grid.clientWidth
  let nextScroll = grid.scrollLeft
  if (cellLeft < viewLeft) {
    nextScroll = cellLeft - inset
  } else if (cellRight > viewRight) {
    nextScroll = cellRight - grid.clientWidth
  }
  nextScroll = Math.max(0, nextScroll)
  if (nextScroll !== grid.scrollLeft) grid.scrollLeft = nextScroll
}