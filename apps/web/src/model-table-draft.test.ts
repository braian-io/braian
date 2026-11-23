// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cancelModelTableLeave,
  confirmModelTableLeaveDiscard,
  modelTableLeaveRequest,
  registerModelTableDraft,
  tryChooseModelSelection,
} from './model-table-draft'
import { chooseModelSelection, getModelSelection } from './model-selection'

vi.mock('./model-selection', async () => {
  const actual = await vi.importActual<typeof import('./model-selection')>('./model-selection')
  return { ...actual, chooseModelSelection: vi.fn(actual.chooseModelSelection) }
})

describe('model table draft guard', () => {
  afterEach(() => {
    registerModelTableDraft(null)
    cancelModelTableLeave()
    vi.mocked(chooseModelSelection).mockClear()
  })

  it('passes through selection when the table is clean', () => {
    registerModelTableDraft({
      dirty: () => false,
      discard: () => undefined,
      review: async () => undefined,
    })
    tryChooseModelSelection({ kind: 'type', typeKey: 'article' })
    expect(chooseModelSelection).toHaveBeenCalledWith({ kind: 'type', typeKey: 'article' })
    expect(modelTableLeaveRequest()).toBeNull()
  })

  it('drops a pending leave request when the table unmounts', () => {
    registerModelTableDraft({
      dirty: () => true,
      discard: () => undefined,
      review: async () => undefined,
    })
    tryChooseModelSelection({ kind: 'type', typeKey: 'article' })
    expect(modelTableLeaveRequest()).toBeTruthy()
    registerModelTableDraft(null)
    expect(modelTableLeaveRequest()).toBeNull()
  })

  it('blocks selection and discard clears the draft before navigating', () => {
    const discard = vi.fn()
    registerModelTableDraft({
      dirty: () => true,
      discard,
      review: async () => undefined,
    })
    chooseModelSelection({ kind: 'type', typeKey: 'product' })
    tryChooseModelSelection({ kind: 'type', typeKey: 'article' })
    expect(chooseModelSelection).not.toHaveBeenCalledWith({ kind: 'type', typeKey: 'article' })
    expect(modelTableLeaveRequest()).toBeTruthy()
    confirmModelTableLeaveDiscard()
    expect(discard).toHaveBeenCalled()
    expect(getModelSelection()).toEqual({ kind: 'type', typeKey: 'article' })
  })
})