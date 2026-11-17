import { describe, expect, it } from 'vitest'
import { findStructureTreeView, structureTreeViewTitle } from './structure-tree-view'

const defs = {
  structures: [
    { key: 'food', labels: { en: 'Food' }, groups: [] },
    { key: 'size', labels: { en: 'Sizes' }, groups: [] },
  ],
}

describe('structure tree view helpers', () => {
  it('resolves the English structure label for a new tree title', () => {
    expect(structureTreeViewTitle('food', defs)).toBe('Food')
  })

  it('reuses a tree by title or structure_key state', () => {
    const views = [
      { id: 't1', type: 'structure_tree', title: 'Structure', state: {} },
      { id: 't2', type: 'structure_tree', title: 'Food', state: { structure_key: 'food' } },
      { id: 't3', type: 'structure_tree', title: 'Sizes', state: {} },
    ]
    expect(findStructureTreeView(views, 'food', defs)?.id).toBe('t2')
    expect(findStructureTreeView(views, 'size', defs)?.id).toBe('t3')
    expect(findStructureTreeView(views, 'missing', defs)).toBeUndefined()
  })
})