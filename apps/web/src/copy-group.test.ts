import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { copy } from './i18n'

function userFacingStrings(value: unknown, path: string, out: Array<[string, string]>) {
  if (typeof value === 'string') {
    out.push([path, value])
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      userFacingStrings(child, path ? `${path}.${key}` : key, out)
    }
  }
}

describe('group wording', () => {
  it('keeps the word class out of user-facing copy', () => {
    const strings: Array<[string, string]> = []
    userFacingStrings(copy, '', strings)
    expect(strings.length).toBeGreaterThan(0)
    for (const [key, value] of strings) {
      expect(value, key).not.toMatch(/\bclass(es)?\b/i)
    }
  })

  it('shows the key warning in the consequence dialog', () => {
    const source = readFileSync(new URL('./consequence.tsx', import.meta.url), 'utf8')
    expect(source).toContain('data-testid="key-warning"')
    expect(source).toContain('consequence.warnings')
  })
})
