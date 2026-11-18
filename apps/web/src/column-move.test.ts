import { describe, expect, it } from 'vitest'
import { columnMoveAppliesTo, uiCommandAppliesToView } from './column-move'
import { publishFrame, resetUiContext } from './ui-context'

describe('uiCommandAppliesToView', () => {
  it('matches column move targeting', () => {
    resetUiContext()
    publishFrame({
      workspace: { id: 'ws', name: 'Test' },
      panes: [{ id: 'products', type: 'object_table', title: 'Products', focused: true }],
      focused: 'products',
      language: 'en',
    })
    expect(uiCommandAppliesToView({ q: 'tent' }, 'products')).toBe(true)
    expect(uiCommandAppliesToView({ q: 'tent' }, 'articles')).toBe(false)
    expect(uiCommandAppliesToView({ q: 'tent', viewId: 'articles' }, 'products')).toBe(false)
    expect(columnMoveAppliesTo({ q: 'tent' }, 'products')).toBe(uiCommandAppliesToView({ q: 'tent' }, 'products'))
  })
})