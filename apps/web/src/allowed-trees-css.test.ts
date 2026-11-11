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

  it('keeps the loading dialog close button available from the first frame', () => {
    expect(rule("[data-testid='review-loading'] .dialog-close")).toContain('display: flex')
  })

  it('shows a locked toggle as inert but keeps its label', () => {
    const locked = rule("[data-testid='allowed-trees'][data-locked='true'] input[type='checkbox']")
    expect(locked).toContain('pointer-events: none')
    expect(locked).toContain('cursor: default')
  })

  it('draws a stronger double focus ring on the dark background', () => {
    const focus = rule("[data-testid='allowed-trees'] input[type='checkbox']:focus-visible")
    expect(focus).toContain('outline: 2px solid var(--text)')
    expect(focus).toContain('outline-offset: 3px')
    expect(focus).toContain('box-shadow: 0 0 0 3px var(--accent)')
  })
})

describe('review steps and attribute columns', () => {
  it('highlights the allowed-tree step and lists the others plainly', () => {
    const steps = rule('.review-steps {')
    expect(steps).toContain('list-style: none')
    expect(rule('.review-step {')).toContain('border-left: 2px solid transparent')
    expect(rule('.review-step.allowed-trees-step {')).toContain('border-left-color: var(--accent)')
  })

  it('gives the long boolean header and the name column their text width', () => {
    expect(rule("[data-testid='attribute-table'] .standard-grid-cell[data-column='showByDefault']"))
      .toContain('width: 124px')
    expect(rule("[data-testid='attribute-table'] .standard-grid-cell[data-column='label']"))
      .toContain('min-width: 180px')
  })
})
