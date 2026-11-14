import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('Detail width layout (row 239)', () => {
  it('keeps the object table at a readable floor only in a wide Detail split', () => {
    expect(css).toMatch(
      /\.split\[data-has-detail='true'\]\s*\{[^}]*container-type:\s*inline-size/,
    )
    expect(css).toMatch(
      /@container detail-split \(min-width:\s*640px\)\s*\{[\s\S]*?\.split-cell:has\(\.pane-tab\[data-view-type='object_table'\]\.active\):not\(:has\(\.split\)\)\s*\{[^}]*min-width:\s*440px/,
    )
    expect(css).not.toMatch(
      /\.split-cell:has\(\.pane-tab\[data-view-type='object_table'\]\):not\(:has\(\.split\)\)\s*\{[^}]*min-width:\s*440px/,
    )
    expect(css).not.toMatch(
      /\.split\[data-has-detail='true'\] > \.split-cell:has\(\.pane-tab\[data-view-type='object_table'\]\)\s*\{[^}]*min-width:\s*440px/,
    )
  })

  it('wraps a long Detail title instead of clipping it', () => {
    expect(css).toMatch(/\.detail-title\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).toMatch(/\.detail-title strong\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('stacks Detail labels above values in a narrow pane', () => {
    expect(css).toMatch(/\.detail-form\s*\{[^}]*min-width:\s*0/)
    expect(css).toMatch(/\.detail-form\s*\{[^}]*width:\s*100%/)
    expect(css).toMatch(/\.detail-form\s*\{[^}]*container-type:\s*inline-size/)
    expect(css).toMatch(/@container detail \(width < 360px\)[\s\S]*?\.field\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/)
  })

  it('keeps the language tag beside the value in a narrow pane', () => {
    expect(css).not.toMatch(/\.lang-row\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).not.toMatch(/\.lang-row input,\s*\.lang-row textarea\s*\{[^}]*flex-basis:\s*100%/)
  })

  it('lets the measure input grow past its starting width', () => {
    expect(css).toMatch(/\.control \.measure input\s*\{[^}]*flex:\s*1 1 88px/)
    expect(css).toMatch(/\.control \.measure input\s*\{[^}]*min-width:\s*88px/)
    expect(css).not.toMatch(/\.measure input\s*\{[^}]*flex:\s*none/)
  })
})
