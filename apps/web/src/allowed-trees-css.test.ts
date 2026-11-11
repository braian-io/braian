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

describe('allowed-tree layout', () => {
  it('uses the attribute-table checkbox size and puts the label beside it', () => {
    const label = rule("[data-testid='allowed-trees'] label")
    expect(label).toContain('flex: none')
    expect(label).toContain('flex-direction: row')
    expect(label).toContain('align-items: center')

    const check = rule("[data-testid='allowed-trees'] input[type='checkbox']")
    expect(check).toContain('width: 16px')
    expect(check).toContain('height: 16px')
    expect(check).toContain('padding: 0')
    expect(check).not.toContain('padding: var(--space-1_5)')
  })

  it('keeps the loading dialog close button out of the way', () => {
    expect(rule("[data-testid='review-loading'] .dialog-close")).toContain('display: none')
  })
})
