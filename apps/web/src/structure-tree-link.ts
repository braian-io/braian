import type { Json } from './api'
import { typeOfView, type TypeName } from './type-labels'
import { isExplicitAllSource, isSourceLocked, peerSourceOf } from './view-source'

export type LinkableView = {
  id: string
  type: string
  state?: Json
}

/** True when an entity type may be grouped in at least one structure the tree can show. */
export function typeAcceptsStructureTree(type: TypeName, defs: Json | undefined): boolean {
  if (!type.id || type.kind === 'link') return false
  const allowed = type.structures
  if (allowed !== undefined && allowed.length === 0) return false
  if (allowed === undefined) return true
  const structures = (defs?.structures as Json[] | undefined) ?? []
  return structures.some((structure) => {
    const token = String(structure.id ?? structure.key)
    const key = String(structure.key ?? '')
    return allowed.includes(token) || allowed.includes(key)
  })
}

/**
 * Object tables that should follow a structure tree when it enters the layout.
 * Skips tables already peer-linked (row or another tree); relinking the same tree is a no-op.
 * `explicitAll: false` is for a tree that was already in the layout: an explicit
 * All stays All until the user adds a tree.
 */
export function objectTablesToAutoLinkToTree(
  treeViewId: string,
  tableViews: LinkableView[],
  types: TypeName[],
  openViewIds: string[],
  defs: Json | undefined,
  options?: { explicitAll?: boolean },
): string[] {
  const open = new Set(openViewIds)
  if (!open.has(treeViewId)) return []
  const targets: string[] = []
  for (const view of tableViews) {
    if (view.type !== 'object_table' || !open.has(view.id)) continue
    if (isSourceLocked(view.state)) continue
    const bound = typeOfView(view, types)
    if (!bound || !typeAcceptsStructureTree(bound, defs)) continue
    const peer = peerSourceOf(view.state)
    if (peer) {
      if (peer.viewId === treeViewId && peer.selection === 'node') continue
      continue
    }
    if (options?.explicitAll === false && isExplicitAllSource(view.state)) continue
    targets.push(view.id)
  }
  return targets
}