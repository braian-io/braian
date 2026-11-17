import { describe, expect, it } from 'vitest'
import { assortmentChipActive } from './table-filters'

const cheeseAssortment = {
  id: 'sel-cheese',
  name: 'Cheese',
  query: { group: 'food:cheese' },
}

describe('assortmentChipActive', () => {
  it('does not highlight a group chip when the table ignores session.group', () => {
    const active = assortmentChipActive(cheeseAssortment, {
      activeGroup: 'food:cheese',
      activeLabelFilter: '',
      activeSelectionFilter: '',
      activeSelectionId: '',
      activeFilter: '',
      groupFilterApplies: false,
    })
    expect(active).toBe(false)
  })

  it('highlights a group chip when the table filter uses session.group', () => {
    const active = assortmentChipActive(cheeseAssortment, {
      activeGroup: 'food:cheese',
      activeLabelFilter: '',
      activeSelectionFilter: '',
      activeSelectionId: '',
      activeFilter: '',
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
      activeGroup: 'food:milk',
      activeLabelFilter: '',
      activeSelectionFilter: 'type_key:=product && groups:=food:cheese',
      activeSelectionId: 'sel-dyn',
      activeFilter: '',
      groupFilterApplies: false,
    })
    expect(active).toBe(true)
  })
})