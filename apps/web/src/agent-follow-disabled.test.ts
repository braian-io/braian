import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('agent follow Send disabled look', () => {
  it('fades the follow Send/Resume icon while keeping opacity 1 for contrast', () => {
    expect(css).toMatch(
      /\.agent-follow \.agent-action:disabled,\s*\n\.agent-follow \.agent-action:disabled:hover\s*\{[^}]*color:\s*color-mix\(in srgb, var\(--muted\) 48%, transparent\)/,
    )
    expect(css).toMatch(
      /\.agent-follow \.agent-action:disabled:hover\s*\{[^}]*opacity:\s*1/,
    )
    expect(css).toMatch(
      /\.agent-follow \.agent-action:disabled:hover\s*\{[^}]*cursor:\s*not-allowed/,
    )
  })
})
