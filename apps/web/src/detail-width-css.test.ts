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

  it('keeps the agent dock in the flex split, including below 1360px', () => {
    expect(css).not.toMatch(/split-catalog-frozen/)
    expect(css).not.toMatch(/data-catalog-scale/)
    expect(css).not.toMatch(/translateX\(18px\)/)
    expect(css).not.toMatch(/split-agent-overlay/)
    expect(css).not.toMatch(
      /\.dock-root > \.split\.horizontal\.split-agent-dock\s*\{[^}]*position:\s*relative/,
    )
    expect(css).toMatch(
      /\.dock-root > \.split\.horizontal\[data-agent-dock='true'\] \.split\[data-has-detail='true'\]\s*\{[^}]*container-type:\s*normal/,
    )
    expect(css).toMatch(
      /@media \(min-width:\s*1280px\)\s*\{[\s\S]*?min-width:\s*360px/,
    )
    expect(css).not.toMatch(/@media \(min-width:\s*1360px\)\s*\{[\s\S]*?min-width:\s*360px/)
    expect(css).toMatch(
      /\.dock-root > \.split\.horizontal\[data-agent-dock='true'\] > \.split-cell[\s\S]*?transition:[^;]*var\(--dur\)/,
    )
    expect(css).toMatch(
      /\.dock-root > \.split\.horizontal\[data-agent-shell='true'\] > \.split-cell[\s\S]*?transition:[^;]*var\(--dur\)/,
    )
    expect(css).toMatch(
      /\.dock-root > \.split\.horizontal\[data-tree-pinned='true'\] > \.split-cell\s*\{[^}]*transition:/,
    )
    expect(css).toMatch(
      /\.dock-root > \.split\.horizontal\[data-tree-pinned='true'\] > \.split-cell:first-child\s*\{[^}]*transition:\s*none/,
    )
  })

  it('does not floor a table beside a direct Detail pane', () => {
    expect(css).toMatch(
      /\.split:has\(> \.split-cell > \.pane \.pane-tab\[data-view-type='object_detail'\]\)\s*>\s*\.split-cell:has\(\.pane-tab\[data-view-type='object_table'\]\.active\):not\(:has\(\.split\)\)\s*\{[^}]*min-width:\s*0/,
    )
    expect(css).toMatch(
      /\.split > \.split-cell:has\(\.pane-tab\[data-view-type='object_detail'\]\.active\):not\(:has\(\.split\)\)\s*\{[^}]*min-width:\s*220px/,
    )
  })

  it('wraps a long Detail title instead of clipping it', () => {
    expect(css).toMatch(/\.detail-title-row\s*\{[^}]*display:\s*flex/)
    expect(css).toMatch(/\.detail-title\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).toMatch(/\.detail-title strong\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })

  it('stacks Detail labels above values in a narrow pane', () => {
    expect(css).toMatch(
      /\.pane:has\(\.detail-form\)\s*\{[^}]*container-type:\s*inline-size/,
    )
    expect(css).toMatch(
      /\.pane:has\(\.detail-form\)\s*\{[^}]*container-name:\s*detail-pane/,
    )
    expect(css).toMatch(/\.detail-form\s*\{[^}]*min-width:\s*0/)
    expect(css).toMatch(/\.detail-form\s*\{[^}]*width:\s*100%/)
    expect(css).not.toMatch(/\.detail-form\s*\{[^}]*container-type/)
    expect(css).not.toMatch(/\.detail-form\s*\{[^}]*container-name:\s*detail\b/)
    expect(css).toMatch(
      /\.detail-form\[data-narrow='true'\] \.field\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    )
    expect(css).toMatch(
      /\.detail-form\[data-narrow='true'\] \.field\s*\{[^}]*row-gap:\s*var\(--space-1\)/,
    )
    expect(css).toMatch(/\.detail-form\[data-narrow='true'\] \.field > label\s*\{[^}]*padding-top:\s*0/)
    expect(css).not.toMatch(/@container detail-pane/)
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
