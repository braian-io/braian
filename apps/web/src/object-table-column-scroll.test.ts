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
    grid.getBoundingClientRect = () => domRect({ left: 0, top: 0, width: 400, height: 200 })
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
    grid.scrollLeft = 0

    const row = document.createElement('div')
    row.className = 'row selected'
    const cellA = document.createElement('div')
    cellA.className = 'cell'
    Object.defineProperty(cellA, 'offsetLeft', { value: 0, configurable: true })
    Object.defineProperty(cellA, 'offsetWidth', { value: 120, configurable: true })
    const cellB = document.createElement('div')
    cellB.className = 'cell active-cell'
    Object.defineProperty(cellB, 'offsetWidth', { value: 120, configurable: true })
    row.append(cellA, cellB)
    grid.append(row)
    document.body.append(grid)

    scrollObjectTableActiveColumn(grid)
    expect(grid.scrollLeft).toBe(40)
    expect(isActiveObjectTableColumnVisible(grid)).toBe(true)

    grid.remove()
  })

  it('scrolls back when the active cell is clipped on the left', () => {
    const grid = document.createElement('div')
    Object.defineProperty(grid, 'clientWidth', { value: 200, configurable: true })
    grid.scrollLeft = 200

    const row = document.createElement('div')
    row.className = 'row active'
    const pad = document.createElement('div')
    pad.className = 'cell'
    Object.defineProperty(pad, 'offsetWidth', { value: 160, configurable: true })
    const cell = document.createElement('div')
    cell.className = 'cell active-cell'
    Object.defineProperty(cell, 'offsetWidth', { value: 120, configurable: true })
    row.append(pad, cell)
    grid.append(row)
    document.body.append(grid)

    scrollObjectTableActiveColumn(grid)
    expect(grid.scrollLeft).toBe(160)
    expect(isActiveObjectTableColumnVisible(grid)).toBe(true)

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