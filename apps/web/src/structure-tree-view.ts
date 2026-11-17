import type { Json } from './api'
import { structureCaption } from './graph-scene'

export type SavedTreeView = { id: string; title: string; type: string; state?: Json }

export function structureTreeViewTitle(structureKey: string, defs?: Json): string {
  return structureCaption(structureKey, defs, structureKey) || structureKey
}

function structureIdForKey(structureKey: string, defs?: Json): string {
  const key = structureKey.trim().toLowerCase()
  const structures = (defs?.structures as Json[] | undefined) ?? []
  const row = structures.find((structure) => String(structure.key ?? '').trim().toLowerCase() === key)
  return row?.id ? String(row.id).trim() : ''
}

/** Reuse a workspace tree view bound to this structure key or id in view state. */
export function findStructureTreeView(
  views: SavedTreeView[],
  structureKey: string,
  defs?: Json,
): SavedTreeView | undefined {
  const key = structureKey.trim().toLowerCase()
  const id = structureIdForKey(structureKey, defs).toLowerCase()
  return views.find((view) => {
    if (view.type !== 'structure_tree') return false
    const stateKey = String(view.state?.structure_key ?? view.state?.structure ?? '').trim().toLowerCase()
    if (stateKey && stateKey === key) return true
    const stateId = String(view.state?.structure_id ?? '').trim().toLowerCase()
    return Boolean(stateId && id && stateId === id)
  })
}

export function structureTreeViewState(structureKey: string, defs?: Json): Json {
  const id = structureIdForKey(structureKey, defs)
  return {
    structure_key: structureKey,
    ...(id ? { structure_id: id } : {}),
  }
}

const PLACEMENT_ANCHOR_TYPES = new Set(['structure_tree', 'object_table'])

/**
 * When Detail is focused, opening a structure tree in the focused pane must not tab into
 * Detail (which would hide it). Prefer an open table or tree pane instead.
 */
export function resolveStructureOpenTarget(
  views: SavedTreeView[],
  focusViewId: string | null | undefined,
  openIds: string[],
  zone: 'center' | 'right',
): string | undefined {
  const focus = focusViewId && openIds.includes(focusViewId) ? focusViewId : undefined
  const focusView = focus ? views.find((view) => view.id === focus) : undefined
  if (zone === 'right' || focusView?.type !== 'object_detail') return focus
  const open = openIds
    .map((id) => views.find((view) => view.id === id))
    .filter((view): view is SavedTreeView => Boolean(view))
  const anchor = open.find((view) => PLACEMENT_ANCHOR_TYPES.has(view.type))
    ?? views.find((view) => PLACEMENT_ANCHOR_TYPES.has(view.type))
  return anchor?.id ?? focus
}