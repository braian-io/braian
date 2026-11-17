import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('agent chat pane polish', () => {
  it('wraps the session title to two lines instead of a single-line ellipsis', () => {
    expect(css).toMatch(/\.agent-view-head h2\s*\{[^}]*-webkit-line-clamp:\s*2/)
    expect(css).not.toMatch(/\.agent-view-head h2\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(css).not.toMatch(/\.agent-view-head h2\s*\{[^}]*white-space:\s*nowrap/)
  })

  it('uses the shared accent shadow ring on the follow-up field', () => {
    expect(css).toMatch(
      /\.agent-follow-input:focus-visible,\s*\n\.agent-follow textarea:focus-visible\s*\{[^}]*box-shadow:\s*var\(--inset\),\s*0 0 0 2px var\(--accent\)/
    )
    expect(css).toMatch(/\.agent-follow-input:focus-visible,\s*\n\.agent-follow textarea:focus-visible\s*\{[^}]*outline:\s*none/)
  })
})