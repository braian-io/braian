import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function rule(selector: string) {
  const start = css.indexOf(selector)
  const open = start < 0 ? -1 : css.indexOf('{', start)
  const close = open < 0 ? -1 : css.indexOf('}', open)
  if (start < 0 || open < 0 || close < 0) throw new Error(`missing rule for ${selector}`)
  return css.slice(open + 1, close)
}

const insetSelectors = [
  '.row:focus-visible',
  '.row .cell:focus-visible',
  '.tree:focus-visible',
  '.tree button:focus-visible',
  '.tree-row:focus-visible',
  '.standard-grid-row:focus-visible',
  '.standard-grid-cell:focus-visible',
]

describe('focus ring', () => {
  it('keeps a shared keyboard-only ring', () => {
    expect(rule(':focus')).toContain('outline: none')
    expect(rule(':focus-visible')).toContain('outline: 2px solid var(--accent)')
  })

  it('draws the ring inside rows, cells and trees', () => {
    for (const selector of insetSelectors) {
      const body = rule(selector)
      expect(body, selector).toContain('outline: 2px solid var(--accent)')
      expect(body, selector).toContain('outline-offset: -2px')
    }
  })

  it('does not hide keyboard focus on rows or the user menu', () => {
    expect(css).not.toMatch(/(?<!\.grid:focus-visible:has\(\.active-cell\) )\.row:focus(?:-visible)?[^{]*\{[^}]*outline:\s*none/)
    expect(css).not.toMatch(/\.standard-grid-row[^{]*:focus[^{]*\{[^}]*outline:\s*none/)
    expect(css).not.toMatch(/\.user-menu-content \.menu-item\s*\{[^}]*outline:\s*none/)
  })

  it('does not stack a row ring on the active cell when the grid has keyboard focus', () => {
    expect(rule('.grid:focus-visible:has(.active-cell) .row:focus-visible')).toContain('outline: none')
    expect(rule('.grid:focus-visible:has(.active-cell) .row.selected:focus-visible')).toContain('outline: none')
  })

  it('puts the grid keyboard mark on the active cell', () => {
    expect(rule('.grid:focus-visible')).toContain('outline: none')
    const cell = rule('.grid:focus-visible .row.selected .cell.active-cell')
    expect(cell).toContain('box-shadow: inset 0 0 0 1px var(--accent-hover)')
    // Focus alone (no selection yet) uses the same one-cell mark, not a row fill.
    const focusedCell = rule('.grid:focus-visible .row.active .cell.active-cell')
    expect(focusedCell).toContain('box-shadow: inset 0 0 0 1px var(--accent-hover)')

    const pointerHeader = rule('.grid:focus-within .head .cell.column-active .column-header-btn')
    expect(pointerHeader).toContain('color: var(--accent)')
    expect(pointerHeader).not.toContain('box-shadow')
    expect(pointerHeader).not.toContain('outline')

    const keyboardHeader = rule('.grid:focus-visible .head .cell.column-active')
    expect(keyboardHeader).toContain('box-shadow: inset 0 -2px 0 var(--accent)')
    expect(css).not.toMatch(/\.grid:focus-within\s*\{[^}]*outline/)
  })

  it('keeps the selected row on its fill and the ring on focus', () => {
    const selected = rule('.row.selected {')
    expect(selected).toContain('background: var(--accent-dim)')
    expect(selected).toContain('box-shadow: inset 3px 0 0 var(--accent)')
    expect(selected).not.toContain('outline')

    const focused = rule('.standard-grid-row:focus-visible')
    expect(focused).toContain('outline: 2px solid var(--accent)')
    expect(focused).not.toContain('background')
  })
})
