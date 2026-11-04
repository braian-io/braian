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
  '.grid:focus-visible',
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
    expect(css).not.toMatch(/\.row:focus(?:-visible)?[^{]*\{[^}]*outline:\s*none/)
    expect(css).not.toMatch(/\.grid:focus(?:-visible)?[^{]*\{[^}]*outline:\s*none/)
    expect(css).not.toMatch(/\.standard-grid-row[^{]*:focus[^{]*\{[^}]*outline:\s*none/)
    expect(css).not.toMatch(/\.user-menu-content \.menu-item\s*\{[^}]*outline:\s*none/)
  })

  it('keeps the selected row on its fill and the ring on focus', () => {
    const selected = rule('.row.selected')
    expect(selected).toContain('background: var(--accent-dim)')
    expect(selected).not.toContain('outline')

    const focused = rule('.row:focus-visible')
    expect(focused).toContain('outline: 2px solid var(--accent)')
    expect(focused).not.toContain('background')
  })
})
