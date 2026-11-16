import { activate, agentDockShare, dockEdge, insert, leaves, migrateLayout, normalize, remove, views, type Node } from './layout'
import type { SavedView } from './type-labels'

const AGENT_DOCK_SHARE = 0.3
const RIGHT_EDGE_EPS = 1e-3

export function agentViewIds(views: SavedView[]): Set<string> {
  return new Set(views.filter((view) => view.type === 'agent').map((view) => view.id))
}

export function agentsNeedDockMigration(layout: Node, agentIds: Set<string>): boolean {
  if (agentIds.size === 0) return false
  const openAgents = views(layout).filter((id) => agentIds.has(id))
  if (openAgents.length === 0) return false
  const agentLeaves = leaves(layout).filter((leaf) => leaf.views.some((id) => agentIds.has(id)))
  if (agentLeaves.length === 0) return true
  for (const leaf of agentLeaves) {
    if (leaf.views.some((id) => !agentIds.has(id))) return true
  }
  if (agentLeaves.length > 1) return true
  const rightmost = Math.max(...leaves(layout).map((leaf) => leaf.rect.x + leaf.rect.w))
  const dock = agentLeaves[0]
  if (dock.rect.x + dock.rect.w < rightmost - RIGHT_EDGE_EPS) return true
  const docked = new Set(dock.views)
  return openAgents.some((id) => !docked.has(id))
}

/** Legacy center/tab agent views move into one right-edge dock tab group. */
export function migrateAgentsToRightDock(layout: Node, agentIds: readonly string[], focus?: string): Node {
  const order = views(layout).filter((id) => agentIds.includes(id))
  const ids = order.length > 0 ? order : [...agentIds]
  if (ids.length === 0) return layout
  let next = layout
  for (const id of ids) next = remove(next, id)
  const primary = ids[0]
  if (views(next).length === 0) {
    next = { type: 'tabs', views: [primary], active: 0 }
  } else {
    next = dockEdge(next, primary, 'right', agentDockShare(next, AGENT_DOCK_SHARE))
  }
  for (let index = 1; index < ids.length; index += 1) {
    next = insert(next, primary, ids[index], 'center')
  }
  const focusId =
    focus && ids.includes(focus) ? focus : ids.includes(focus ?? '') ? focus! : ids[ids.length - 1]
  if (focusId) next = activate(next, focusId)
  return normalize(next)
}

export function healAgentDockLayout(
  layout: Node | undefined,
  viewsList: SavedView[],
  focus?: string,
): { changed: boolean; layout: Node | undefined } {
  const base = layout ? migrateLayout(layout) : { type: 'tabs' as const, views: [] as string[], active: 0 }
  const agentIds = agentViewIds(viewsList)
  if (agentIds.size === 0 || !agentsNeedDockMigration(base, agentIds)) {
    return { changed: false, layout: undefined }
  }
  return {
    changed: true,
    layout: migrateAgentsToRightDock(base, [...agentIds], focus),
  }
}