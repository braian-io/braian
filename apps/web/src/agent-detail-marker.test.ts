import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('agent left-edge marker', () => {
  it('uses a full-height ::before stripe so Detail matches table panes', () => {
    expect(css).toMatch(/\.pane\[data-agent-working='true'\]::before\s*\{/)
    expect(css).toMatch(
      /\.pane\[data-agent-working='true'\]::before\s*\{[^}]*width:\s*3px/,
    )
    expect(css).toMatch(
      /\.pane\[data-agent-working='true'\]::before\s*\{[^}]*background:\s*var\(--accent\)/,
    )
    // Avoid relying on inset box-shadow alone (opaque Detail chrome covers it).
    expect(css).not.toMatch(
      /\.pane\[data-agent-working='true'\]\s*\{[^}]*inset 3px 0 0 var\(--accent\)/,
    )
  })
})
