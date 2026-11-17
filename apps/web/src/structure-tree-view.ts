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

function viewStructureBinding(view: SavedTreeView): { key: string; id: string } {
  return {
    key: String(view.state?.structure_key ?? view.state?.structure ?? '').trim().toLowerCase(),
    id: String(view.state?.structure_id ?? '').trim().toLowerCase(),
  }
}

function isLegacyKeylessTree(view: SavedTreeView): boolean {
  if (view.type !== 'structure_tree') return false
  const binding = viewStructureBinding(view)
  return !binding.key && !binding.id
}

/** Reuse a workspace tree view bound to this structure key or id in view state. */
export function findStructureTreeView(
  views: SavedTreeView[],
  structureKey: string,
  defs?: Json,
): SavedTreeView | undefined {
  const key = structureKey.trim().toLowerCase()
  const id = structureIdForKey(structureKey, defs).toLowerCase()
  const keyed = views.find((view) => {
    if (view.type !== 'structure_tree') return false
    const binding = viewStructureBinding(view)
    if (binding.key && binding.key === key) return true
    return Boolean(binding.id && id && binding.id === id)
  })
  if (keyed) return keyed

  const label = structureTreeViewTitle(structureKey, defs).trim().toLowerCase()
  return views.find((view) => {
    if (!isLegacyKeylessTree(view)) return false
    const title = view.title.trim().toLowerCase()
    return title === label || title === key
  })
}

export function structureTreeViewState(structureKey: string, defs?: Json): Json {
  const id = structureIdForKey(structureKey, defs)
  return {
    structure_key: structureKey,
    ...(id ? { structure_id: id } : {}),
  }
}

/** True when view state should gain structure_key / structure_id for Open structure › reuse. */
export function structureTreeViewNeedsBackfill(
  view: SavedTreeView,
  structureKey: string,
  defs?: Json,
): boolean {
  if (view.type !== 'structure_tree') return false
  const target = structureTreeViewState(structureKey, defs)
  const currentKey = String(view.state?.structure_key ?? view.state?.structure ?? '').trim()
  const targetKey = String(target.structure_key ?? '').trim()
  if (currentKey && currentKey.toLowerCase() === targetKey.toLowerCase()) {
    const currentId = String(view.state?.structure_id ?? '').trim().toLowerCase()
    const targetId = String(target.structure_id ?? '').trim().toLowerCase()
    return Boolean(targetId && currentId !== targetId)
  }
  return true
}

export function mergeStructureTreeViewState(view: SavedTreeView, structureKey: string, defs?: Json): Json {
  const base = view.state && typeof view.state === 'object' && !Array.isArray(view.state)
    ? { ...(view.state as Record<string, unknown>) }
    : {}
  return { ...base, ...structureTreeViewState(structureKey, defs) }
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