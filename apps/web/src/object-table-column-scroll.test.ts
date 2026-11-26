// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  activeObjectTableCell,
  isActiveObjectTableColumnVisible,
  scrollObjectTableActiveColumn,
  stickyLeadingInset,
} from './object-table-column-scroll'

function domRect(box: { left: number; top: number; width: number; height: number }): DOMRect {
  const { left, top, width, height } = box
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('object-table-column-scroll', () => {
  it('returns zero inset without sticky cells', () => {
    const grid = document.createElement('div')
    grid.scrollLeft = 20
    expect(stickyLeadingInset(grid)).toBe(0)
  })

  it('counts a stuck leading sticky column', () => {
    const grid = document.createElement('div')
    grid.scrollLeft = 40
    const row = document.createElement('div')
    row.className = 'row'
    const sticky = document.createElement('div')
    sticky.className = 'cell'
    Object.defineProperty(sticky, 'offsetWidth', { value: 80, configurable: true })
    sticky.getBoundingClientRect = () => domRect({ left: 0, top: 0, width: 80, height: 28 })
    const plain = document.createElement('div')
    plain.className = 'cell'
    const original = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      if (element === sticky) {
        return { position: 'sticky', left: '0px' } as CSSStyleDeclaration
      }
      return original(element)
    })
    row.append(sticky, plain)
    grid.append(row)
    expect(stickyLeadingInset(grid)).toBe(80)
    vi.restoreAllMocks()
  })

  it('scrolls horizontally when the active cell is clipped on the right', () => {
    const grid = document.createElement('div')
    Object.defineProperty(grid, 'clientWidth', { value: 200, configurable: true })
    Object.defineProperty(grid, 'scrollWidth', { value: 400, configurable: true })
    grid.scrollLeft = 0

    const row = document.createElement('div')
    row.className = 'row selected'
    const cellA = document.createElement('div')
    cellA.className = 'cell'
    Object.defineProperty(cellA, 'offsetWidth', { value: 120, configurable: true })
    const cellB = document.createElement('div')
    cellB.className = 'cell active-cell'
    Object.defineProperty(cellB, 'offsetWidth', { value: 120, configurable: true })
    row.append(cellA, cellB)
    grid.append(row)
    document.body.append(grid)

    scrollObjectTableActiveColumn(grid)
    expect(grid.scrollLeft).toBe(40)

    grid.remove()
  })

  it('pins the start of a column wider than the scrollport', () => {
    const grid = document.createElement('div')
    Object.defineProperty(grid, 'clientWidth', { value: 220, configurable: true })
    Object.defineProperty(grid, 'scrollWidth', { value: 900, configurable: true })
    grid.scrollLeft = 0

    const row = document.createElement('div')
    row.className = 'row selected'
    const number = document.createElement('div')
    number.className = 'cell'
    Object.defineProperty(number, 'offsetWidth', { value: 160, configurable: true })
    const name = document.createElement('div')
    name.className = 'cell active-cell'
    Object.defineProperty(name, 'offsetWidth', { value: 280, configurable: true })
    row.append(number, name)
    grid.append(row)
    document.body.append(grid)

    scrollObjectTableActiveColumn(grid)
    // Trailing alignment would be 280+160-220 = 220 and hide the start of Name.
    expect(grid.scrollLeft).toBe(160)
    expect(isActiveObjectTableColumnVisible(grid)).toBe(true)

    grid.remove()
  })

  it('includes a sticky inset that appears only after the first scroll', () => {
    const grid = document.createElement('div')
    Object.defineProperty(grid, 'clientWidth', { value: 200, configurable: true })
    Object.defineProperty(grid, 'scrollWidth', { value: 500, configurable: true })
    grid.scrollLeft = 0

    const row = document.createElement('div')
    row.className = 'row'
    const sticky = document.createElement('div')
    sticky.className = 'cell'
    Object.defineProperty(sticky, 'offsetWidth', { value: 80, configurable: true })
    const middle = document.createElement('div')
    middle.className = 'cell'
    Object.defineProperty(middle, 'offsetWidth', { value: 120, configurable: true })
    const active = document.createElement('div')
    active.className = 'cell active-cell'
    Object.defineProperty(active, 'offsetWidth', { value: 150, configurable: true })
    row.append(sticky, middle, active)
    grid.append(row)
    document.body.append(grid)

    const original = window.getComputedStyle.bind(window)
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
      if (element === sticky) return { position: 'sticky', left: '0px' } as CSSStyleDeclaration
      return original(element)
    })

    scrollObjectTableActiveColumn(grid)
    // First pass ignores the inset (scrollLeft is still 0) and would land at 150.
    // The second pass sees the sticky cover and pins the cell's start after it.
    expect(grid.scrollLeft).toBe(120)
    expect(isActiveObjectTableColumnVisible(grid)).toBe(true)

    vi.restoreAllMocks()
    grid.remove()
  })

  it('scrolls back when the active cell is clipped on the left', () => {
    const grid = document.createElement('div')
    Object.defineProperty(grid, 'clientWidth', { value: 200, configurable: true })
    Object.defineProperty(grid, 'scrollWidth', { value: 500, configurable: true })
    grid.scrollLeft = 200

    const row = document.createElement('div')
    row.className = 'row active'
    const cell = document.createElement('div')
    cell.className = 'cell active-cell'
    Object.defineProperty(cell, 'offsetWidth', { value: 120, configurable: true })
    row.append(cell)
    grid.append(row)
    document.body.append(grid)

    scrollObjectTableActiveColumn(grid)
    expect(grid.scrollLeft).toBe(0)

    grid.remove()
  })

  it('finds the active cell on the focused row', () => {
    const grid = document.createElement('div')
    const row = document.createElement('div')
    row.className = 'row active'
    const cell = document.createElement('div')
    cell.className = 'cell active-cell'
    row.append(cell)
    grid.append(row)
    expect(activeObjectTableCell(grid)).toBe(cell)
  })
})