import { describe, expect, it } from 'vitest'
import { leaves, splitPair, tabGroup, views } from './layout'
import { agentViewIds, agentsNeedDockMigration, healAgentDockLayout, migrateAgentsToRightDock } from './agent-layout-migrate'
import type { SavedView } from './type-labels'

const table = 'table'
const detail = 'detail'
const agentA = 'agent-a'
const agentB = 'agent-b'

const catalog: SavedView[] = [
  { id: table, type: 'object_table', title: 'Products', pane: 'main', position: 0, state: {} },
  { id: detail, type: 'object_detail', title: 'Detail', pane: 'main', position: 1, state: {} },
  { id: agentA, type: 'agent', title: 'Ask', pane: 'main', position: 2, state: {} },
  { id: agentB, type: 'agent', title: 'Ask again', pane: 'main', position: 3, state: {} },
]

describe('healAgentDockLayout', () => {
  it('moves a legacy agent tab out of the products tab group', () => {
    const legacy = tabGroup([table, agentA], 1)
    expect(agentsNeedDockMigration(legacy, agentViewIds(catalog))).toBe(true)
    const healed = healAgentDockLayout(legacy, catalog, agentA)
    expect(healed.changed).toBe(true)
    const next = healed.layout!
    expect(views(next)).toEqual([table, agentA])
    const tablePane = leaves(next).find((leaf) => leaf.views.includes(table))
    const agentPane = leaves(next).find((leaf) => leaf.views.includes(agentA))
    expect(tablePane?.views).toEqual([table])
    expect(agentPane?.views).toEqual([agentA])
    expect((agentPane?.rect.x ?? 0) + (agentPane?.rect.w ?? 0)).toBeGreaterThan((tablePane?.rect.x ?? 0) + (tablePane?.rect.w ?? 0))
  })

  it('is idempotent once agents sit in the right dock', () => {
    const legacy = tabGroup([table, agentA], 1)
    const first = healAgentDockLayout(legacy, catalog, agentA)
    const second = healAgentDockLayout(first.layout, catalog, agentA)
    expect(second.changed).toBe(false)
  })

  it('keeps multiple agent tabs in the same right pane', () => {
    const legacy = tabGroup([table, agentA, agentB], 2)
    const healed = healAgentDockLayout(legacy, catalog, agentB)
    const agentPane = leaves(healed.layout!).find((leaf) => leaf.views.includes(agentA))
    expect(agentPane?.views).toEqual([agentA, agentB])
  })

  it('repairs a horizontal split when the agent is not on the right', () => {
    const wrong = splitPair('horizontal', 0.3, tabGroup([agentA]), tabGroup([table, detail]))
    expect(agentsNeedDockMigration(wrong, agentViewIds(catalog))).toBe(true)
    const next = migrateAgentsToRightDock(wrong, [agentA], agentA)
    const tablePane = leaves(next).find((leaf) => leaf.views.includes(table))
    const agentPane = leaves(next).find((leaf) => leaf.views.includes(agentA))
    expect((agentPane?.rect.x ?? 0)).toBeGreaterThan((tablePane?.rect.x ?? 0))
  })
})