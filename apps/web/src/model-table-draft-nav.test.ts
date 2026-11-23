import { afterEach, describe, expect, it } from 'vitest'
import { tabGroup } from './layout'
import { isTypeAttributesDockView, layoutLeavesTypeAttributes } from './model-table-draft-nav'
import { registerModelTableDraft } from './model-table-draft'

describe('model table layout guard', () => {
  afterEach(() => registerModelTableDraft(null))

  it('detects the Type attributes view', () => {
    expect(isTypeAttributesDockView({ id: 'v1', type: 'data_model', state: { mode: 'classes' }, title: 'Type attributes' })).toBe(true)
    expect(isTypeAttributesDockView({ id: 'v2', type: 'data_model', state: { mode: 'tree' }, title: 'Structures' })).toBe(false)
  })

  it('requires a guard when focus leaves the Type attributes tab', () => {
    registerModelTableDraft({
      dirty: () => true,
      discard: () => undefined,
      review: async () => undefined,
    })
    const views = [
      { id: 'attrs', type: 'data_model', state: { mode: 'classes' }, title: 'Type attributes' },
      { id: 'types', type: 'object_types', title: 'Object types' },
    ]
    const before = {
      id: 'ws',
      title: 'Data model',
      layout: tabGroup(['attrs', 'types'], 0),
      focus: 'attrs',
    }
    const after = { ...before, layout: tabGroup(['attrs', 'types'], 1), focus: 'types' }
    expect(layoutLeavesTypeAttributes(views, before, after)).toBe(true)
  })
})