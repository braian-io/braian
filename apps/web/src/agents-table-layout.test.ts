import { describe, expect, it } from 'vitest'
import { dockEdge, type Node } from './layout'
import { agentsTablePlacementTarget, agentsTableSharesAgentDock } from './agents-table-layout'

const catalog = [
  { id: 'products', type: 'object_table' },
  { id: 'detail', type: 'object_detail' },
  { id: 'agent-a', type: 'agent' },
  { id: 'agents-list', type: 'agents' },
]

describe('agentsTablePlacementTarget', () => {
  it('avoids the focused agent pane', () => {
    const layout = dockEdge({ type: 'tabs', views: ['products'], active: 0 }, 'agent-a', 'right', 0.3) as Node
    expect(agentsTablePlacementTarget(layout, catalog, 'agent-a')).toBe('products')
  })

  it('prefers the object table when focus is missing', () => {
    const layout = dockEdge({ type: 'tabs', views: ['products'], active: 0 }, 'agent-a', 'right', 0.3) as Node
    expect(agentsTablePlacementTarget(layout, catalog)).toBe('products')
  })

  it('detects agents table tabbed into the agent dock', () => {
    let layout = dockEdge({ type: 'tabs', views: ['products'], active: 0 }, 'agent-a', 'right', 0.3) as Node
    layout = { type: 'tabs', views: ['agent-a', 'agents-list'], active: 1 }
    expect(agentsTableSharesAgentDock(layout, catalog, 'agents-list')).toBe(true)
  })
})