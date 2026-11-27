import type { Json } from './api'
import {
  EMPTY_MANUAL_FILTER,
  groupKeyOf,
  isEmptyManualQuery,
  isHandPickedQuery,
  labelCodes,
  labelSearchFilter,
  memberIdFilter,
  memberIdsOf,
  selectionFilterText,
  selectionSearchText,
} from './assortment-filter'

/** Manual assortment stored with a group (not a dynamic filter query). */
export function manualSelectionHasGroup(query: unknown): boolean {
  if (!query || typeof query !== 'object') return false
  if (selectionFilterText(query)) return false
  const group = (query as { group?: unknown }).group
  return typeof group === 'string' && group.length > 0
}

/** Group-only manual assortment — label-only selections are not included. */
export function isGroupOnlyManualSelection(query: unknown): boolean {
  if (!manualSelectionHasGroup(query)) return false
  if (isEmptyManualQuery(query)) return false
  return labelCodes((query as { labels?: unknown }).labels).length === 0
}

export type AssortmentChipContext = {
  activeGroup: string | null
  activeLabelFilter: string
  activeSelectionFilter: string
  activeSelectionId: string
  activeFilter: string
  /** When false, session.group is not applied to the table query (explicit All or peer source). */
  groupFilterApplies: boolean
  defs?: Json
}

/** Whether a saved selection chip should show as active for the table's real row filter. */
export function assortmentChipActive(item: Json, ctx: AssortmentChipContext): boolean {
  const query = (item.query as Json) ?? {}
  const members = memberIdsOf(item)
  if (members.length > 0 || isHandPickedQuery(query)) {
    return ctx.activeSelectionId === String(item.id ?? '')
      && ctx.activeSelectionFilter === memberIdFilter(members)
  }
  const dynamicFilter = selectionFilterText(query)
  if (dynamicFilter) return dynamicFilter === ctx.activeSelectionFilter || dynamicFilter === ctx.activeFilter
  if (!dynamicFilter && isEmptyManualQuery(query)) return ctx.activeSelectionFilter === EMPTY_MANUAL_FILTER
  if (ctx.activeSelectionFilter) return false
  const wantGroup = query.group ? String(query.group) : ''
  const wantLabels = labelSearchFilter(query, ctx.defs)
  if (wantGroup && ctx.activeGroup && ctx.groupFilterApplies) {
    const a = groupKeyOf(wantGroup, ctx.defs)
    const b = groupKeyOf(ctx.activeGroup, ctx.defs)
    if (a === b || wantGroup === ctx.activeGroup) return wantLabels === ctx.activeLabelFilter
  }
  if (!wantGroup && wantLabels && wantLabels === ctx.activeLabelFilter && (!ctx.activeGroup || !ctx.groupFilterApplies)) return true
  return false
}

export type SelectionApplyMode = 'follow' | 'peer' | 'node' | 'explicit-all'

export type SelectionPatch = {
  /** Table search box. A dynamic selection can carry the saved `q`. */
  filter: string
  selectionFilter: string
  labelFilter: string
  selectionId: string
  /** Table-local group. Null clears a previous pin. */
  localGroup: string | null
  /**
   * Workspace group write. Absent means leave the global group alone
   * (peer, explicit All, or a locked workspace).
   */
  globalGroup?: string | null
}

export type SelectionApplyPlan =
  | { action: 'ignore' }
  | { action: 'clear'; globalGroup?: null }
  | { action: 'leave-all'; patch: SelectionPatch }
  | { action: 'apply'; patch: SelectionPatch }

/**
 * Chip inputs for one table. A local group pin is part of the query even when
 * session.group is not (peer source, explicit All, or a locked workspace).
 */
export function selectionChipContext(input: {
  sessionGroup: string | null
  activeLabelFilter: string
  activeSelectionFilter: string
  activeSelectionId: string
  activeFilter: string
  sessionGroupApplies: boolean
  localGroup: string | null
  defs?: Json
}): AssortmentChipContext {
  return {
    activeGroup: input.localGroup ?? (input.sessionGroupApplies ? input.sessionGroup : null),
    activeLabelFilter: input.activeLabelFilter,
    activeSelectionFilter: input.activeSelectionFilter,
    activeSelectionId: input.activeSelectionId,
    activeFilter: input.activeFilter,
    groupFilterApplies: input.localGroup != null || input.sessionGroupApplies,
    defs: input.defs,
  }
}

/**
 * One decision for a saved-selection click and for a selection applied from
 * another view. Callers commit the patch; they do not branch on their own.
 */
export function planSelectionApply(input: {
  item: Json
  ctx: AssortmentChipContext
  mode: SelectionApplyMode
  locked: boolean
}): SelectionApplyPlan {
  if (assortmentChipActive(input.item, input.ctx)) {
    return input.locked ? { action: 'clear' } : { action: 'clear', globalGroup: null }
  }
  const parts = selectionParts(input.item, input.ctx.defs)
  const handPicked = memberIdsOf(input.item).length > 0 || isHandPickedQuery(parts.query)
  if (handPicked) {
    return {
      action: 'apply',
      patch: {
        filter: '',
        selectionFilter: parts.selectionFilter,
        labelFilter: '',
        selectionId: parts.selectionId,
        localGroup: null,
        ...(input.locked ? {} : { globalGroup: null }),
      },
    }
  }
  const groupOnly = isGroupOnlyManualSelection(parts.query)
  // A row peer's rows come from another table, so a group chip cannot change them.
  // A structure-node peer is this table's own group filter: pin the group locally.
  if (groupOnly && input.mode === 'peer') return { action: 'ignore' }
  if (groupOnly && input.mode === 'explicit-all') {
    if (input.locked) return { action: 'ignore' }
    return {
      action: 'leave-all',
      patch: {
        filter: parts.q,
        selectionFilter: parts.selectionFilter,
        labelFilter: parts.labelFilter,
        selectionId: parts.selectionId,
        localGroup: null,
        globalGroup: parts.group,
      },
    }
  }
  const pinLocally = input.mode !== 'follow' || input.locked
  if (pinLocally && manualSelectionHasGroup(parts.query)) {
    return {
      action: 'apply',
      patch: {
        filter: parts.q,
        selectionFilter: parts.selectionFilter,
        labelFilter: parts.labelFilter,
        selectionId: parts.selectionId,
        localGroup: parts.group,
      },
    }
  }
  return {
    action: 'apply',
    patch: {
      filter: parts.q,
      selectionFilter: parts.selectionFilter,
      labelFilter: parts.labelFilter,
      selectionId: parts.selectionId,
      localGroup: null,
      ...(input.locked ? {} : { globalGroup: parts.group }),
    },
  }
}

function selectionParts(item: Json, defs?: Json) {
  const query = (item.query as Json) ?? {}
  const members = memberIdsOf(item)
  if (members.length > 0 || isHandPickedQuery(query)) {
    return {
      query,
      q: '',
      selectionId: String(item.id ?? ''),
      selectionFilter: memberIdFilter(members),
      labelFilter: '',
      group: null as string | null,
    }
  }
  const dynamicFilter = selectionFilterText(query)
  const q = selectionSearchText(query)
  const emptyManual = !dynamicFilter && !q && isEmptyManualQuery(query)
  const rawGroup = (query as { group?: unknown }).group
  const group = !dynamicFilter && !emptyManual && typeof rawGroup === 'string' && rawGroup
    ? rawGroup
    : null
  return {
    query,
    q,
    selectionId: String(item.id ?? ''),
    selectionFilter: dynamicFilter || (emptyManual ? EMPTY_MANUAL_FILTER : ''),
    labelFilter: dynamicFilter || emptyManual ? '' : labelSearchFilter(query, defs),
    group,
  }
}