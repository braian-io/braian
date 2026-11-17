import { describe, expect, it } from 'vitest'
import { dockEdge, insert, type Node } from './layout'
import { agentsTableNeedsCatalogTab, agentsTablePlacementTarget } from './agents-table-layout'

const catalog = [
  { id: 'tree', title: 'Food', type: 'structure_tree' },
  { id: 'products', title: 'Products', type: 'object_table' },
  { id: 'agent-a', title: 'Agent', type: 'agent' },
  { id: 'agents-list', title: 'Agents', type: 'agents' },
]

describe('agentsTablePlacementTarget', () => {
  it('tabs into Products even when a narrow tree pane is open beside the agent', () => {
    const layout = dockEdge(
      insert({ type: 'tabs', views: ['tree'], active: 0 }, 'tree', 'products', 'right'),
      'agent-a',
      'right',
      0.3,
    ) as Node
    expect(agentsTablePlacementTarget(layout, catalog)).toBe('products')
  })
})

describe('agentsTableNeedsCatalogTab', () => {
  it('moves the list when it is tabbed with the agent dock', () => {
    const layout = { type: 'tabs', views: ['agent-a', 'agents-list'], active: 1 } as Node
    expect(agentsTableNeedsCatalogTab(layout, 'agents-list', 'products')).toBe(true)
  })

  it('leaves the list when it already shares the Products tab group', () => {
    const layout = { type: 'tabs', views: ['products', 'agents-list'], active: 1 } as Node
    expect(agentsTableNeedsCatalogTab(layout, 'agents-list', 'products')).toBe(false)
  })
})
