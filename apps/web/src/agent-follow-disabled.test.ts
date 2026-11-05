import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('agent follow Send disabled look', () => {
  it('dims the follow Send/Resume icon with opacity while keeping muted color', () => {
    expect(css).toMatch(
      /\.agent-follow \.agent-action:disabled,\s*\n\.agent-follow \.agent-action:disabled:hover\s*\{[^}]*color:\s*var\(--muted\)/,
    )
    expect(css).toMatch(
      /\.agent-follow \.agent-action:disabled:hover\s*\{[^}]*opacity:\s*0\.42/,
    )
    expect(css).toMatch(
      /\.agent-follow \.agent-action:disabled:hover\s*\{[^}]*cursor:\s*not-allowed/,
    )
  })
})
