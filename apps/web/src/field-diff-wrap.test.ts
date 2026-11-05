import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('field-diff wrap', () => {
  it('wraps long proposal lines instead of ellipsis truncation', () => {
    expect(css).toMatch(/\.field-diff li\s*\{[^}]*overflow-wrap:\s*anywhere/)
    expect(css).toMatch(/\.field-diff li\s*\{[^}]*white-space:\s*normal/)
    expect(css).not.toMatch(/\.field-diff li\s*\{[^}]*text-overflow:\s*ellipsis/)
    expect(css).toMatch(/\.diff-new\s*\{[^}]*overflow-wrap:\s*anywhere/)
  })
})
