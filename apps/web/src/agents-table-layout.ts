import { leaves, views, type Node } from './layout'

type CatalogRow = { id: string; type: string; title?: string }

/** Open the agents table beside catalog views, never as a tab inside the agent dock column. */
export function agentsTablePlacementTarget(
  layout: Node,
  catalog: readonly CatalogRow[],
  focus?: string,
): string | undefined {
  const open = views(layout)
  const types = new Map(catalog.map((row) => [row.id, row.type]))
  const inAgentDock = (id: string) => types.get(id) === 'agent'
  if (focus && open.includes(focus) && !inAgentDock(focus)) return focus
  const table = catalog.find(
    (row) => (row.type === 'object_table' || row.title === 'Products') && open.includes(row.id),
  )
  if (table) return table.id
  return open.find((id) => !inAgentDock(id) && types.get(id) !== 'agents')
}

export function agentsTableSharesAgentDock(
  layout: Node,
  catalog: readonly CatalogRow[],
  agentsTableId: string,
): boolean {
  if (!views(layout).includes(agentsTableId)) return false
  const types = new Map(catalog.map((row) => [row.id, row.type]))
  for (const leaf of leaves(layout)) {
    if (!leaf.views.includes(agentsTableId)) continue
    return leaf.views.some((id) => types.get(id) === 'agent')
  }
  return false
}