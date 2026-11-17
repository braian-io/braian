import { describe, expect, it } from 'vitest'
import { assortmentChipActive, isGroupOnlyManualSelection, manualSelectionHasGroup } from './table-filters'

const cheeseAssortment = {
  id: 'sel-cheese',
  name: 'Cheese',
  query: { group: 'food:cheese' },
}

const organicAssortment = {
  id: 'sel-organic',
  name: 'Organic',
  query: { labels: 'organic_eu' },
}

const baseCtx = {
  activeLabelFilter: '',
  activeSelectionFilter: '',
  activeSelectionId: '',
  activeFilter: '',
  defs: undefined as undefined,
}

describe('manualSelectionHasGroup / isGroupOnlyManualSelection', () => {
  it('treats stored group, not dynamic filter, as group assortment', () => {
    expect(manualSelectionHasGroup(cheeseAssortment.query)).toBe(true)
    expect(manualSelectionHasGroup(organicAssortment.query)).toBe(false)
    expect(manualSelectionHasGroup({ filter: 'groups:=food:cheese' })).toBe(false)
    expect(isGroupOnlyManualSelection(cheeseAssortment.query)).toBe(true)
    expect(isGroupOnlyManualSelection(organicAssortment.query)).toBe(false)
    expect(isGroupOnlyManualSelection({ group: 'food:cheese', labels: 'organic_eu' })).toBe(false)
  })
})

describe('assortmentChipActive', () => {
  it('does not highlight a group chip when the table ignores session.group', () => {
    const active = assortmentChipActive(cheeseAssortment, {
      ...baseCtx,
      activeGroup: 'food:cheese',
      groupFilterApplies: false,
    })
    expect(active).toBe(false)
  })

  it('highlights a group chip when the table filter uses session.group', () => {
    const active = assortmentChipActive(cheeseAssortment, {
      ...baseCtx,
      activeGroup: 'food:cheese',
      groupFilterApplies: true,
    })
    expect(active).toBe(true)
  })

  it('still honors dynamic selection filters when group is ignored', () => {
    const dynamic = {
      id: 'sel-dyn',
      name: 'Dynamic',
      query: { filter: 'type_key:=product && groups:=food:cheese' },
    }
    const active = assortmentChipActive(dynamic, {
      ...baseCtx,
      activeGroup: 'food:milk',
      activeSelectionFilter: 'type_key:=product && groups:=food:cheese',
      groupFilterApplies: false,
    })
    expect(active).toBe(true)
  })

  it('does not stay lit from activeSelectionId alone (explicit All after click)', () => {
    const active = assortmentChipActive(cheeseAssortment, {
      ...baseCtx,
      activeGroup: null,
      activeSelectionId: 'sel-cheese',
      groupFilterApplies: false,
    })
    expect(active).toBe(false)
  })

  it('does not stay lit when another table applied the same selection (peer source)', () => {
    const active = assortmentChipActive(cheeseAssortment, {
      ...baseCtx,
      activeGroup: 'food:cheese',
      activeSelectionId: 'sel-cheese',
      groupFilterApplies: false,
    })
    expect(active).toBe(false)
  })

  it('highlights a label chip when only the label filter applies (peer-linked table)', () => {
    const active = assortmentChipActive(organicAssortment, {
      ...baseCtx,
      activeGroup: 'food:cheese',
      activeLabelFilter: 'a_labels:=organic_eu',
      groupFilterApplies: false,
    })
    expect(active).toBe(true)
  })

  it('toggles off only when the group filter really applies', () => {
    const on = assortmentChipActive(cheeseAssortment, {
      ...baseCtx,
      activeGroup: 'food:cheese',
      groupFilterApplies: true,
    })
    const off = assortmentChipActive(cheeseAssortment, {
      ...baseCtx,
      activeGroup: 'food:milk',
      groupFilterApplies: true,
    })
    expect(on).toBe(true)
    expect(off).toBe(false)
  })
})