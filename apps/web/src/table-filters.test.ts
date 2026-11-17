import { describe, expect, it } from 'vitest'
import { assortmentChipActive } from './table-filters'

const cheeseAssortment = {
  id: 'sel-cheese',
  name: 'Cheese',
  query: { group: 'food:cheese' },
}

const baseCtx = {
  activeLabelFilter: '',
  activeSelectionFilter: '',
  activeSelectionId: '',
  activeFilter: '',
  defs: undefined as undefined,
}

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