// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StructuresCancelled,
  cancelStructuresStage,
  clearStagedStructures,
  lockedStructuresType,
  releaseStructuresLock,
  stageModel,
  structuresStageInFlight,
  takeStagedStructures,
} from './model-stage'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return methods
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('model set_structures staging', () => {
  beforeEach(() => {
    mock.post.mockReset()
    clearStagedStructures()
    releaseStructuresLock()
  })

  afterEach(() => {
    clearStagedStructures()
    releaseStructuresLock()
  })

  it('coalesces a rapid double click into one request and one staged step', async () => {
    const gate = deferred<unknown>()
    mock.post.mockReturnValue(gate.promise)
    const args = { type_key: 'product', structures: ['structure-food'] }

    const first = stageModel('model.set_structures', args)
    const second = stageModel('model.set_structures', args)
    expect(structuresStageInFlight()).toBe(true)
    expect(mock.post).toHaveBeenCalledTimes(1)

    gate.resolve({ count: 1, steps: [{ op: 'set_structures', type_key: 'product', structures: ['structure-food'] }] })
    await Promise.all([first, second])

    expect(mock.post).toHaveBeenCalledTimes(1)
    expect(takeStagedStructures()).toEqual([
      { index: 0, typeKey: 'product', structures: ['structure-food'] },
    ])
    expect(lockedStructuresType()).toBe('product')
  })

  it('finds the created step by type and content instead of assuming it is last', async () => {
    mock.post.mockResolvedValue({
      count: 2,
      steps: [
        { op: 'set_structures', type_key: 'article', structures: ['structure-food'] },
        { op: 'set_structures', type_key: 'product', structures: ['structure-food'] },
        { op: 'create_type', key: 'later' },
      ],
    })
    await stageModel('model.set_structures', { type_key: 'product', structures: ['structure-food'] })
    expect(takeStagedStructures()).toEqual([
      { index: 1, typeKey: 'product', structures: ['structure-food'] },
    ])
  })

  it('replaces the step this UI staged earlier for the same type', async () => {
    mock.post
      .mockResolvedValueOnce({
        count: 1,
        steps: [{ op: 'set_structures', type_key: 'product', structures: ['structure-food'] }],
      })
      .mockResolvedValueOnce({ count: 0, steps: [] })
      .mockResolvedValueOnce({
        count: 1,
        steps: [{ op: 'set_structures', type_key: 'product', structures: ['structure-market'] }],
      })

    await stageModel('model.set_structures', { type_key: 'product', structures: ['structure-food'] })
    releaseStructuresLock()
    await stageModel('model.set_structures', { type_key: 'product', structures: ['structure-market'] })

    expect(mock.post.mock.calls.map((call) => (call[1] as { body?: unknown })?.body)).toEqual([
      { operation: 'model.set_structures', args: { type_key: 'product', structures: ['structure-food'] } },
      { remove: 0 },
      { operation: 'model.set_structures', args: { type_key: 'product', structures: ['structure-market'] } },
    ])
    expect(takeStagedStructures()).toEqual([
      { index: 0, typeKey: 'product', structures: ['structure-market'] },
    ])
  })

  it('removes the step and unlocks when the request is cancelled in flight', async () => {
    const gate = deferred<unknown>()
    mock.post.mockReturnValueOnce(gate.promise).mockResolvedValueOnce({ count: 0, steps: [] })
    const pending = stageModel('model.set_structures', {
      type_key: 'product',
      structures: ['structure-food'],
    })
    expect(cancelStructuresStage()).toBe(true)
    gate.resolve({
      count: 1,
      steps: [{ op: 'set_structures', type_key: 'product', structures: ['structure-food'] }],
    })
    await expect(pending).rejects.toBeInstanceOf(StructuresCancelled)
    expect(mock.post).toHaveBeenLastCalledWith('/v1/model/draft/steps', { body: { remove: 0 } })
    expect(lockedStructuresType()).toBeNull()
    expect(takeStagedStructures()).toEqual([])
  })

  it('unlocks when the stage request fails', async () => {
    mock.post.mockRejectedValueOnce(new Error('network down'))
    const ended = vi.fn()
    window.addEventListener('braian-review-pending-end', ended)
    await expect(stageModel('model.set_structures', {
      type_key: 'product',
      structures: ['structure-food'],
    })).rejects.toThrow('network down')
    window.removeEventListener('braian-review-pending-end', ended)
    expect(lockedStructuresType()).toBeNull()
    expect(ended).toHaveBeenCalled()
  })
})
