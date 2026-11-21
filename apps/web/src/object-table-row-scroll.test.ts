// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { objectTableBodyViewport, scrollObjectTableActiveRow } from './object-table-row-scroll'

function domRect(top: number, height: number, width = 200): DOMRect {
  const bottom = top + height
  return {
    top,
    bottom,
    left: 0,
    right: width,
    width,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

describe('object-table-row-scroll', () => {
  it('measures the body viewport below the sticky header', () => {
    const grid = document.createElement('div')
    grid.className = 'grid'
    const head = document.createElement('div')
    head.className = 'head'
    grid.append(head)
    document.body.append(grid)
    grid.getBoundingClientRect = () => domRect(100, 400)
    head.getBoundingClientRect = () => domRect(100, 28)
    expect(objectTableBodyViewport(grid)).toEqual({ top: 128, bottom: 500 })
    grid.remove()
  })

  it('scrolls down only enough to align the active row bottom', () => {
    const grid = document.createElement('div')
    grid.className = 'grid'
    Object.defineProperty(grid, 'clientHeight', { value: 200, configurable: true })
    grid.scrollTop = 0
    const head = document.createElement('div')
    head.className = 'head'
    const row = document.createElement('div')
    row.id = 'object-row-test'
    row.setAttribute('data-testid', 'object-row')
    row.className = 'active'
    grid.append(head, row)
    grid.setAttribute('aria-activedescendant', row.id)
    document.body.append(grid)

    grid.getBoundingClientRect = () => domRect(0, 200)
    head.getBoundingClientRect = () => domRect(0, 28)
    row.getBoundingClientRect = () => domRect(204, 28)

    scrollObjectTableActiveRow(grid, 'down')
    expect(grid.scrollTop).toBe(32)

    grid.remove()
  })

  it('scrolls up only enough to align the active row top below the header', () => {
    const grid = document.createElement('div')
    grid.className = 'grid'
    grid.scrollTop = 120
    const head = document.createElement('div')
    head.className = 'head'
    const row = document.createElement('div')
    row.id = 'object-row-up'
    row.setAttribute('data-testid', 'object-row')
    row.className = 'active'
    grid.append(head, row)
    grid.setAttribute('aria-activedescendant', row.id)
    document.body.append(grid)

    grid.getBoundingClientRect = () => domRect(0, 200)
    head.getBoundingClientRect = () => domRect(0, 28)
    row.getBoundingClientRect = () => domRect(20, 28)

    scrollObjectTableActiveRow(grid, 'up')
    expect(grid.scrollTop).toBe(112)

    grid.remove()
  })
})