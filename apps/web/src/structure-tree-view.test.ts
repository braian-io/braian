import { describe, expect, it } from 'vitest'
import {
  findStructureTreeView,
  mergeStructureTreeViewState,
  resolveStructureOpenTarget,
  structureTreeViewNeedsBackfill,
  structureTreeViewState,
  structureTreeViewTitle,
} from './structure-tree-view'

const defs = {
  structures: [
    { id: 's-food', key: 'food', labels: { en: 'Food' }, groups: [] },
    { id: 's-size', key: 'size', labels: { en: 'Sizes' }, groups: [] },
  ],
}

describe('structure tree view helpers', () => {
  it('resolves the English structure label for a new tree title', () => {
    expect(structureTreeViewTitle('food', defs)).toBe('Food')
  })

  it('reuses by structure_key or structure_id state', () => {
    const views = [
      { id: 't1', type: 'structure_tree', title: 'Food', state: { structure_key: 'food' } },
      { id: 't2', type: 'structure_tree', title: 'Sizes', state: { structure_id: 's-size' } },
      { id: 't3', type: 'structure_tree', title: 'Sizes', state: {} },
    ]
    expect(findStructureTreeView(views, 'food', defs)?.id).toBe('t1')
    expect(findStructureTreeView(views, 'size', defs)?.id).toBe('t2')
    expect(findStructureTreeView(views, 'missing', defs)).toBeUndefined()
    expect(findStructureTreeView(views, 'food', defs)?.id).not.toBe('t3')
  })

  it('reuses a legacy keyless tree by display title', () => {
    const views = [
      { id: 'legacy', type: 'structure_tree', title: 'Food', state: { expanded: ['dairy'] } },
    ]
    expect(findStructureTreeView(views, 'food', defs)?.id).toBe('legacy')
  })

  it('stores structure_key and structure_id in new view state', () => {
    expect(structureTreeViewState('size', defs)).toEqual({
      structure_key: 'size',
      structure_id: 's-size',
    })
  })

  it('detects when a reused tree needs structure binding backfill', () => {
    const legacy = { id: 'legacy', type: 'structure_tree', title: 'Food', state: { expanded: [] } }
    expect(structureTreeViewNeedsBackfill(legacy, 'food', defs)).toBe(true)
    expect(structureTreeViewNeedsBackfill(
      { ...legacy, state: structureTreeViewState('food', defs) },
      'food',
      defs,
    )).toBe(false)
    expect(mergeStructureTreeViewState(legacy, 'food', defs)).toEqual({
      expanded: [],
      structure_key: 'food',
      structure_id: 's-food',
    })
  })

  it('avoids Detail as the center placement anchor', () => {
    const views = [
      { id: 'v-table', type: 'object_table', title: 'Products' },
      { id: 'v-detail', type: 'object_detail', title: 'Detail' },
      { id: 'v-tree', type: 'structure_tree', title: 'Food' },
    ]
    expect(resolveStructureOpenTarget(views, 'v-detail', ['v-table', 'v-detail'], 'center')).toBe('v-table')
    expect(resolveStructureOpenTarget(views, 'v-detail', ['v-table', 'v-detail'], 'right')).toBe('v-detail')
    expect(resolveStructureOpenTarget(views, 'v-table', ['v-table', 'v-detail'], 'center')).toBe('v-table')
  })
})