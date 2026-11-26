import { describe, expect, it } from 'vitest'
import {
  assortmentChipActive,
  isGroupOnlyManualSelection,
  manualSelectionHasGroup,
  planSelectionApply,
  selectionChipContext,
  type AssortmentChipContext,
  type SelectionApplyMode,
} from './table-filters'

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

const cheeseOrganic = {
  id: 'sel-both',
  name: 'Cheese organic',
  query: { group: 'food:cheese', labels: 'organic_eu' },
}

const idle = (groupFilterApplies: boolean, activeGroup: string | null = null): AssortmentChipContext => ({
  ...baseCtx,
  activeGroup,
  groupFilterApplies,
})

function appliedContext(
  item: typeof cheeseOrganic,
  mode: SelectionApplyMode,
  locked: boolean,
  sessionGroup: string | null,
) {
  const plan = planSelectionApply({
    item,
    ctx: selectionChipContext({
      sessionGroup,
      activeLabelFilter: '',
      activeSelectionFilter: '',
      activeSelectionId: '',
      activeFilter: '',
      sessionGroupApplies: mode === 'follow' && !locked,
      localGroup: null,
      defs: undefined,
    }),
    mode,
    locked,
  })
  expect(plan.action === 'apply' || plan.action === 'leave-all').toBe(true)
  if (plan.action !== 'apply' && plan.action !== 'leave-all') throw new Error('expected a patch')
  const followAfter = plan.action === 'leave-all' || (mode === 'follow' && !locked)
  const nextSession = plan.patch.globalGroup !== undefined ? plan.patch.globalGroup : sessionGroup
  return {
    plan,
    ctx: selectionChipContext({
      sessionGroup: nextSession,
      activeLabelFilter: plan.patch.labelFilter,
      activeSelectionFilter: plan.patch.selectionFilter,
      activeSelectionId: plan.patch.selectionId,
      activeFilter: plan.patch.filter,
      sessionGroupApplies: followAfter,
      localGroup: plan.patch.localGroup,
      defs: undefined,
    }),
  }
}

describe('planSelectionApply', () => {
  it('applies a group-plus-label selection locally on peer and explicit All', () => {
    for (const mode of ['peer', 'explicit-all'] as const) {
      const { plan, ctx } = appliedContext(cheeseOrganic, mode, false, 'food:milk')
      expect(plan.action).toBe('apply')
      if (plan.action !== 'apply') continue
      expect(plan.patch.localGroup).toBe('food:cheese')
      expect(plan.patch.labelFilter).toContain('organic_eu')
      expect(plan.patch.globalGroup).toBeUndefined()
      expect(assortmentChipActive(cheeseOrganic, ctx)).toBe(true)
      expect(ctx.activeGroup).toBe('food:cheese')
    }
  })

  it('matches a click and a cross-table apply for the same table', () => {
    const ctx = idle(false)
    const click = planSelectionApply({ item: cheeseOrganic, ctx, mode: 'peer', locked: false })
    const fromOtherView = planSelectionApply({ item: cheeseOrganic, ctx, mode: 'peer', locked: false })
    expect(fromOtherView).toEqual(click)
    const again = planSelectionApply({
      item: cheeseOrganic,
      ctx: appliedContext(cheeseOrganic, 'peer', false, 'food:milk').ctx,
      mode: 'peer',
      locked: false,
    })
    expect(again.action).toBe('clear')
    if (again.action === 'clear') expect(again.globalGroup).toBeNull()
  })

  it('does not write the global group while the workspace is locked', () => {
    for (const mode of ['follow', 'peer', 'explicit-all'] as const) {
      const plan = planSelectionApply({
        item: cheeseOrganic,
        ctx: idle(mode === 'follow'),
        mode,
        locked: true,
      })
      expect(plan.action).toBe('apply')
      if (plan.action !== 'apply') continue
      expect(plan.patch.globalGroup).toBeUndefined()
      expect(plan.patch.localGroup).toBe('food:cheese')
      expect(plan.patch.labelFilter).toContain('organic_eu')
    }
    const turnedOff = planSelectionApply({
      item: cheeseOrganic,
      ctx: appliedContext(cheeseOrganic, 'follow', true, 'food:milk').ctx,
      mode: 'follow',
      locked: true,
    })
    expect(turnedOff).toEqual({ action: 'clear' })
  })

  it('keeps group-only peer inert and leaves explicit All before a global group', () => {
    expect(planSelectionApply({
      item: cheeseAssortment,
      ctx: idle(false, 'food:milk'),
      mode: 'peer',
      locked: false,
    })).toEqual({ action: 'ignore' })
    expect(planSelectionApply({
      item: cheeseAssortment,
      ctx: idle(false),
      mode: 'explicit-all',
      locked: true,
    })).toEqual({ action: 'ignore' })
    const leave = planSelectionApply({
      item: cheeseAssortment,
      ctx: idle(false),
      mode: 'explicit-all',
      locked: false,
    })
    expect(leave.action).toBe('leave-all')
    if (leave.action !== 'leave-all') return
    expect(leave.patch.globalGroup).toBe('food:cheese')
    expect(leave.patch.localGroup).toBeNull()
    expect(leave.patch.labelFilter).toBe('')
  })

  it('still publishes a group on an unlocked table that follows the tree', () => {
    const plan = planSelectionApply({
      item: cheeseOrganic,
      ctx: idle(true, 'food:milk'),
      mode: 'follow',
      locked: false,
    })
    expect(plan.action).toBe('apply')
    if (plan.action !== 'apply') return
    expect(plan.patch.globalGroup).toBe('food:cheese')
    expect(plan.patch.localGroup).toBeNull()
    expect(plan.patch.labelFilter).toContain('organic_eu')
    const labelOnly = planSelectionApply({
      item: organicAssortment,
      ctx: idle(false, 'food:milk'),
      mode: 'peer',
      locked: false,
    })
    expect(labelOnly.action).toBe('apply')
    if (labelOnly.action !== 'apply') return
    expect(labelOnly.patch.globalGroup).toBeNull()
    expect(labelOnly.patch.localGroup).toBeNull()
    expect(labelOnly.patch.labelFilter).toContain('organic_eu')
  })

  it('applies hand-picked members as an id filter and does not pin the group', () => {
    const hand = {
      id: 'sel-hand',
      name: 'Hand',
      kind: 'manual',
      query: { hand: true },
      member_ids: ['obj-a', 'obj-b'],
    }
    const plan = planSelectionApply({
      item: hand,
      ctx: idle(true, 'food:cheese'),
      mode: 'follow',
      locked: false,
    })
    expect(plan.action).toBe('apply')
    if (plan.action !== 'apply') return
    expect(plan.patch.selectionFilter).toBe('id:=[`obj-a`,`obj-b`]')
    expect(plan.patch.labelFilter).toBe('')
    expect(plan.patch.localGroup).toBeNull()
    expect(plan.patch.globalGroup).toBeNull()
    expect(plan.patch.selectionId).toBe('sel-hand')
    const ctx = {
      ...idle(false),
      activeSelectionFilter: plan.patch.selectionFilter,
      activeSelectionId: plan.patch.selectionId,
      activeFilter: '',
    }
    expect(assortmentChipActive(hand, ctx)).toBe(true)
    expect(assortmentChipActive({ ...hand, member_ids: ['obj-a'] }, ctx)).toBe(false)
  })
})