import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

function token(block: string, name: string) {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`missing ${name}`)
  return match[1].trim()
}

function parseHex(value: string) {
  const hex = value.replace('#', '')
  if (hex.length === 8) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: Number.parseInt(hex.slice(6, 8), 16) / 255,
    }
  }
  if (hex.length === 6) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1,
    }
  }
  throw new Error(`unsupported color ${value}`)
}

function blend(fg: ReturnType<typeof parseHex>, bg: ReturnType<typeof parseHex>) {
  const a = fg.a + bg.a * (1 - fg.a)
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
  }
}

function luminance({ r, g, b }: { r: number; g: number; b: number }) {
  const channel = (value: number) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: number, b: number) {
  const lighter = Math.max(a, b)
  const darker = Math.min(a, b)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('accent tokens', () => {
  it('uses accent on breadcrumb text', () => {
    expect(css).toMatch(/\.crumb\s*\{[^}]*color:\s*var\(--accent\)/)
  })

  it('keeps popover-wrapped menus on a single surface', () => {
    expect(css).toMatch(/\.popover-content \.menu\s*\{[^}]*border:\s*0/)
    expect(css).toMatch(/\.popover-content\.import-menu[\s\S]*box-shadow:\s*var\(--shadow-md\),\s*var\(--inset\)/)
  })

  it('tints only the active palette row and keeps query marks typographic', () => {
    expect(css).toMatch(/\.palette \.hit\.on,\s*\n\.palette \.hit\.on:hover/)
    expect(css).toMatch(/\.palette \.hit:hover:not\(\.on\)[\s\S]*background:\s*transparent/)
    expect(css).toMatch(/\.palette \.hit\.on \.mark[\s\S]*background:\s*transparent/)
    expect(css).toMatch(/\.palette \.hit\.on \.mark[\s\S]*text-decoration:\s*underline/)
  })

  it('keeps light accent-dim strong enough for text on the wash', () => {
    const light = css.slice(css.indexOf(":root[data-theme='light']"))
    const bg = parseHex(token(light, '--bg'))
    const text = parseHex(token(light, '--text'))
    const dim = parseHex(token(light, '--accent-dim'))
    const wash = blend(dim, { ...bg, a: 1 })
    const ratio = contrast(luminance(text), luminance(wash))
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    const darkBlock = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='light']"))
    const darkAlpha = parseHex(token(darkBlock, '--accent-dim')).a
    expect(dim.a).toBeGreaterThan(darkAlpha)
  })
})
