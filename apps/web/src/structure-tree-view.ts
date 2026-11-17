import type { Json } from './api'
import { structureCaption } from './graph-scene'

export type SavedTreeView = { id: string; title: string; type: string; state?: Json }

export function structureTreeViewTitle(structureKey: string, defs?: Json): string {
  return structureCaption(structureKey, defs, structureKey) || structureKey
}

/** Reuse a workspace tree view bound to this structure key or display title. */
export function findStructureTreeView(
  views: SavedTreeView[],
  structureKey: string,
  defs?: Json,
): SavedTreeView | undefined {
  const label = structureTreeViewTitle(structureKey, defs).trim().toLowerCase()
  const key = structureKey.trim().toLowerCase()
  return views.find((view) => {
    if (view.type !== 'structure_tree') return false
    const stateKey = String(view.state?.structure_key ?? view.state?.structure ?? '').trim().toLowerCase()
    if (stateKey && stateKey === key) return true
    const title = view.title.trim().toLowerCase()
    return title === label || title === key
  })
}

export function structureTreeViewState(structureKey: string): Json {
  return { structure_key: structureKey }
}