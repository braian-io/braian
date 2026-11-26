import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('e2e showProducts helper', () => {
  it('does not catch errors and call resetProductsLayout', () => {
    const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
    const src = readFileSync(join(webRoot, 'e2e/ui.ts'), 'utf8')
    const match = src.match(/export async function showProducts[\s\S]*?\n\}/)
    expect(match, 'showProducts export').toBeTruthy()
    expect(match![0]).not.toMatch(/\bcatch\b/)
    expect(match![0]).not.toMatch(/resetProductsLayout/)
  })
})