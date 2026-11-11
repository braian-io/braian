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

  it('clears a stored type that is not in the definitions', async () => {
    localStorage.setItem('braian.modelSelection', JSON.stringify({ kind: 'type', typeKey: 'missing_type' }))
    const model = await import('./model-selection')
    model.registerModelDefinitions({
      types: [{ key: 'product', id: 'type-product' }],
      structures: [],
    })
    expect(model.getModelSelection()).toBeNull()
    expect(localStorage.getItem('braian.modelSelection')).toBeNull()
  })

  it('clears the selection when its type is deleted', async () => {
    const model = await import('./model-selection')
    model.registerModelDefinitions({
      types: [{ key: 'product', id: 'type-product' }, { key: 'article', id: 'type-article' }],
      structures: [],
    })
    model.chooseModelSelection({ kind: 'type', typeKey: 'product' })
    expect(model.getModelSelection()).toEqual({ kind: 'type', typeKey: 'product' })

    model.registerModelDefinitions({
      types: [{ key: 'article', id: 'type-article' }],
      structures: [],
    })
    expect(model.getModelSelection()).toBeNull()
    expect(localStorage.getItem('braian.modelSelection')).toBeNull()
  })

  it('keeps a group only while its structure and group exist', async () => {
    const model = await import('./model-selection')
    const defs = {
      types: [],
      structures: [{ key: 'food', id: 'structure-food', groups: [{ key: 'dairy' }] }],
    }
    model.registerModelDefinitions(defs)
    model.chooseModelSelection({ kind: 'group', structure: 'food', group: 'dairy' })
    expect(model.getModelSelection()).toEqual({ kind: 'group', structure: 'food', group: 'dairy' })

    model.registerModelDefinitions({
      types: [],
      structures: [{ key: 'food', id: 'structure-food', groups: [{ key: 'meat' }] }],
    })
    expect(model.getModelSelection()).toBeNull()
  })

  it('drops an unknown stored key at module load using the saved definitions snapshot', async () => {
    const first = await import('./model-selection')
    first.registerModelDefinitions({
      types: [{ key: 'product', id: 'type-product' }],
      structures: [{ key: 'food', id: 'structure-food', groups: [{ key: 'dairy' }] }],
    })
    localStorage.setItem('braian.modelSelection', JSON.stringify({ kind: 'type', typeKey: 'ghost' }))

    vi.resetModules()
    const reloaded = await import('./model-selection')
    expect(reloaded.getModelSelection()).toBeNull()
    expect(localStorage.getItem('braian.modelSelection')).toBeNull()
  })
})
