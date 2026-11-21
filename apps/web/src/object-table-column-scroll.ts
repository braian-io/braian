const EPS = 1

function cellBox(cell: HTMLElement): { left: number; width: number } {
  const row = cell.closest<HTMLElement>('.row')
  if (!row) {
    const width = cell.offsetWidth || cell.getBoundingClientRect().width
    return { left: cell.offsetLeft, width }
  }
  let left = 0
  for (const probe of row.querySelectorAll<HTMLElement>('.cell')) {
    const width = probe.offsetWidth || probe.getBoundingClientRect().width
    if (probe === cell) return { left, width }
    left += width
  }
  const width = cell.offsetWidth || cell.getBoundingClientRect().width
  return { left, width }
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
    inset += cell.offsetWidth || cell.getBoundingClientRect().width
  }
  return inset
}

export function activeObjectTableCell(grid: HTMLElement): HTMLElement | null {
  return grid.querySelector<HTMLElement>('.cell.active-cell')
}

type Frame = {
  inset: number
  cellLeft: number
  cellRight: number
  width: number
  viewLeft: number
  viewRight: number
  available: number
}

function frameOf(grid: HTMLElement, cell: HTMLElement): Frame {
  const inset = stickyLeadingInset(grid)
  const { left: cellLeft, width } = cellBox(cell)
  const viewLeft = grid.scrollLeft + inset
  const viewRight = grid.scrollLeft + grid.clientWidth
  return {
    inset,
    cellLeft,
    cellRight: cellLeft + width,
    width,
    viewLeft,
    viewRight,
    available: Math.max(0, viewRight - viewLeft),
  }
}

function maxScroll(grid: HTMLElement): number {
  return Math.max(0, grid.scrollWidth - grid.clientWidth)
}

/** Scroll offset that puts the active cell fully in view, or pins its start when it cannot fit. */
function targetScroll(grid: HTMLElement, frame: Frame): number {
  let next = grid.scrollLeft
  if (frame.width > frame.available + EPS) {
    // A column wider than the scrollport cannot be fully shown. Pin its start
    // so the value is readable; aligning the trailing edge hides that start.
    next = frame.cellLeft - frame.inset
  } else if (frame.cellLeft < frame.viewLeft - EPS) {
    next = frame.cellLeft - frame.inset
  } else if (frame.cellRight > frame.viewRight + EPS) {
    next = frame.cellRight - grid.clientWidth
  }
  return Math.max(0, Math.min(next, maxScroll(grid)))
}

/**
 * True when the active cell is fully inside the scrollport, or — when it is
 * wider than the port — scrolled so its leading edge is in view and the port
 * is filled by the cell.
 */
export function isActiveObjectTableColumnVisible(grid: HTMLElement): boolean {
  const cell = activeObjectTableCell(grid)
  if (!cell) return false
  const frame = frameOf(grid, cell)
  const overlap = Math.min(frame.cellRight, frame.viewRight) - Math.max(frame.cellLeft, frame.viewLeft)
  const target = Math.min(frame.width, frame.available)
  if (overlap < target - EPS) return false
  if (frame.width <= frame.available + EPS) return true
  return Math.abs(grid.scrollLeft - targetScroll(grid, frame)) <= EPS
}

/** Keep the keyboard-active column inside the grid's horizontal scrollport. */
export function scrollObjectTableActiveColumn(grid: HTMLElement | null | undefined): void {
  if (!grid) return
  const cell = activeObjectTableCell(grid)
  if (!cell) return
  // The first assignment can move scrollLeft off 0, which is when a leading
  // sticky column starts covering the cell. The second pass includes that inset.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = targetScroll(grid, frameOf(grid, cell))
    if (Math.abs(next - grid.scrollLeft) <= EPS) break
    grid.scrollLeft = next
  }
  if (!isActiveObjectTableColumnVisible(grid)) {
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
}
