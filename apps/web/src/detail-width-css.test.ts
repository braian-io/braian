import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('Detail width layout (row 239)', () => {
  it('keeps the object table at a readable floor when Detail is beside it', () => {
    expect(css).toMatch(
      /\.split\[data-has-detail='true'\] > \.split-cell:has\(\.pane-tab\[data-view-type='object_table'\]\)\s*\{[^}]*min-width:\s*440px/,
    )
  })

  it('wraps a long Detail title instead of clipping it', () => {
    expect(css).toMatch(/\.detail-title\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).toMatch(/\.detail-title strong\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('stacks Detail labels above values in a narrow pane', () => {
    expect(css).toMatch(/\.detail-form\s*\{[^}]*container-type:\s*inline-size/)
    expect(css).toMatch(/@container detail \(width < 360px\)[\s\S]*?\.field\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('lets the measure input grow past its starting width', () => {
    expect(css).toMatch(/\.control \.measure input\s*\{[^}]*flex:\s*1 1 88px/)
    expect(css).toMatch(/\.control \.measure input\s*\{[^}]*min-width:\s*88px/)
    expect(css).not.toMatch(/\.measure input\s*\{[^}]*flex:\s*none/)
  })
})
