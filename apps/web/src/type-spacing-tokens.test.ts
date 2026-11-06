import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const button = readFileSync(new URL('./components/ui/button.tsx', import.meta.url), 'utf8')

const root = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='light']"))

function token(name: string) {
  const match = root.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`missing ${name}`)
  return match[1].trim()
}

describe('type and spacing tokens', () => {
  it('defines the type scale without reusing the text color tokens', () => {
    expect(token('--text-xs')).toBe('10px')
    expect(token('--text-sm')).toBe('11px')
    expect(token('--text-md')).toBe('12px')
    expect(token('--text-base')).toBe('13px')
    expect(token('--text-lg')).toBe('14px')
    expect(token('--text-xl')).toBe('15px')
    expect(token('--text-2xl')).toBe('18px')
    expect(token('--text-3xl')).toBe('22px')
    expect(token('--text')).toMatch(/^#/)
    expect(token('--text-2')).toMatch(/^#/)
  })

  it('defines the spacing scale', () => {
    expect(token('--space-0_5')).toBe('2px')
    expect(token('--space-1')).toBe('4px')
    expect(token('--space-1_5')).toBe('6px')
    expect(token('--space-2')).toBe('8px')
    expect(token('--space-2_5')).toBe('10px')
    expect(token('--space-3')).toBe('12px')
    expect(token('--space-4')).toBe('16px')
    expect(token('--space-5')).toBe('20px')
    expect(token('--space-6')).toBe('24px')
    expect(token('--space-7')).toBe('28px')
  })

  it('uses tokens for type and common spacing instead of hardcoded px', () => {
    expect(css).not.toMatch(/font-size:\s*\d+px/)
    expect(css).toMatch(/\.app-bar\s*\{[^}]*gap:\s*var\(--space-2\)/)
    expect(css).toMatch(/\.app-bar\s*\{[^}]*padding:\s*0 var\(--space-2_5\)/)
  })

  it('wires the button base size to the base text token', () => {
    expect(button).toContain('text-[length:var(--text-base)]')
    expect(button).not.toContain('text-[13px]')
  })
})
