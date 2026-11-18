import type { Json } from './api'
import {
  EMPTY_MANUAL_FILTER,
  groupKeyOf,
  isEmptyManualQuery,
  labelCodes,
  labelSearchFilter,
  selectionFilterText,
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