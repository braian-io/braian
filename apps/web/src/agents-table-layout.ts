import { leaves, views, type Node } from './layout'

type CatalogRow = { id: string; type: string; title?: string }

/** Tab the agents list into Products, not the focused narrow pane or the agent dock. */
export function agentsTablePlacementTarget(
  layout: Node,
  catalog: readonly CatalogRow[],
): string | undefined {
  const open = views(layout)
  const products = catalog.find(
    (row) => row.type === 'object_table' && row.title === 'Products' && open.includes(row.id),
  )
  if (products) return products.id
  const table = catalog.find((row) => row.type === 'object_table' && open.includes(row.id))
  if (table) return table.id
  return open.find((id) => {
    const type = catalog.find((row) => row.id === id)?.type
    return type !== 'agent' && type !== 'agents'
  })
}

export function agentsTableNeedsCatalogTab(
  layout: Node,
  agentsTableId: string,
  targetId: string | undefined,
): boolean {
  if (!targetId) return false
  if (!views(layout).includes(agentsTableId)) return true
  const leaf = leaves(layout).find((item) => item.views.includes(agentsTableId))
  return !leaf?.views.includes(targetId)
}
