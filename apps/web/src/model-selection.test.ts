// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('model selection persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('keeps the selected type across a reload', async () => {
    const first = await import('./model-selection')
    first.chooseModelSelection({ kind: 'type', typeKey: 'product' })
    expect(JSON.parse(localStorage.getItem('braian.modelSelection') ?? 'null')).toEqual({
      kind: 'type',
      typeKey: 'product',
    })

    vi.resetModules()
    const reloaded = await import('./model-selection')
    expect(reloaded.getModelSelection()).toEqual({ kind: 'type', typeKey: 'product' })
    expect(reloaded.getPreviewType()).toBe('product')
  })

  it('keeps a group selection across a reload', async () => {
    const first = await import('./model-selection')
    first.chooseModelSelection({ kind: 'group', structure: 'food', group: 'dairy' })

    vi.resetModules()
    const reloaded = await import('./model-selection')
    expect(reloaded.getModelSelection()).toEqual({ kind: 'group', structure: 'food', group: 'dairy' })
  })

  it('ignores a malformed stored value', async () => {
    localStorage.setItem('braian.modelSelection', '{"kind":"type"}')
    vi.resetModules()
    const reloaded = await import('./model-selection')
    expect(reloaded.getModelSelection()).toBeNull()
  })
})
