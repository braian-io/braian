import { describe, expect, it } from 'vitest'
import {
  persistWorkspaceMigration,
  type PersistDeps,
  type PersistPatch,
  type PersistWorkspace,
} from './workspace-migration-persist'

function freeObject(value: object) {
  return { ...(value as Record<string, unknown>) }
}

/** Old order (layout before creates) — kept in the test to prove the regression. */
async function persistWorkspaceMigrationLayoutFirst(
  workspace: PersistWorkspace,
  patch: PersistPatch,
  deps: PersistDeps,
) {
  if ((patch.name && patch.name !== workspace.name) || patch.layout) {
    const layout = patch.layout ?? workspace.layout ?? { tabs: [] }
    await deps.postWorkspace({
      id: workspace.id,
      name: patch.name ?? workspace.name,
      locked: workspace.locked,
      share_token: workspace.share_token,
      layout: deps.freeObject(layout && typeof layout === 'object' ? (layout as object) : { tabs: [] }),
    })
  }
  for (const view of patch.create ?? []) {
    await deps.postView({
      id: view.id,
      workspace_id: workspace.id,
      type: view.type,
      title: view.title,
      pane: view.pane ?? 'main',
      position: view.position ?? 0,
      state: deps.freeObject(view.state),
    })
  }
  for (const view of patch.views) {
    const full = (workspace.views ?? []).find((item) => item.id === view.id)
    if (!full) continue
    await deps.postView({
      id: full.id,
      workspace_id: workspace.id,
      type: view.type ?? full.type,
      title: view.title,
      pane: full.pane ?? 'center',
      position: full.position ?? 0,
      state: deps.freeObject(view.state),
    })
  }
}


function workspace(): PersistWorkspace {
  return {
    id: 'ws-1',
    name: 'Heal dangling panes',
    locked: false,
    share_token: null,
    layout: { type: 'tabs', views: ['old'], active: 0 },
    views: [{ id: 'structures', type: 'data_model', title: 'Structures', pane: 'main', position: 0, state: { mode: 'tree' } }],
  }
}

function patch(): PersistPatch {
  return {
    views: [],
    create: [
      { id: 'ot', type: 'object_types', title: 'Object types', state: {}, pane: 'main', position: 1 },
      { id: 'lt', type: 'link_types', title: 'Link types', state: {}, pane: 'main', position: 2 },
    ],
    layout: {
      type: 'tabs',
      views: ['structures', 'ot', 'lt'],
      active: 0,
    },
  }
}

function trackingDeps(failOnCreateId?: string) {
  const views: string[] = []
  const workspaces: unknown[] = []
  const personal: unknown[] = []
  const order: string[] = []
  const deps: PersistDeps = {
    freeObject,
    postView: async (body) => {
      const id = String(body.id)
      if (failOnCreateId && id === failOnCreateId) throw new Error(`create failed: ${id}`)
      views.push(id)
      order.push(`view:${id}`)
    },
    postWorkspace: async (body) => {
      workspaces.push(body.layout)
      order.push('shared')
    },
    putPersonalLayout: async (layout) => {
      personal.push(layout)
      order.push('personal')
    },
  }
  return { deps, views, workspaces, personal, order }
}

describe('persistWorkspaceMigration view-then-layout', () => {
  it('does not write personal layout when a view create fails, then writes it after creates succeed on retry', async () => {
    const ws = workspace()
    const p = patch()

    const first = trackingDeps('lt')
    await expect(persistWorkspaceMigration(ws, p, first.deps)).rejects.toThrow('create failed: lt')
    expect(first.views).toEqual(['ot'])
    expect(first.order).toEqual(['view:ot'])
    expect(first.personal, 'personal layout must not be saved after a failed create').toEqual([])
    expect(first.workspaces, 'shared layout must not be saved after a failed create').toEqual([])

    // Retry after the failed create (migratedRef cleared by shell): creates finish, then personal PUT.
    const second = trackingDeps()
    await persistWorkspaceMigration(ws, p, second.deps)
    expect(second.views).toEqual(['ot', 'lt'])
    expect(second.order).toEqual(['view:ot', 'view:lt', 'personal'])
    expect(second.personal).toHaveLength(1)
    expect(second.workspaces).toEqual([])
  })

  it('writes the personal layout only after every view create succeeds', async () => {
    const { deps, views, workspaces, personal, order } = trackingDeps()
    await persistWorkspaceMigration(workspace(), patch(), deps)
    expect(views).toEqual(['ot', 'lt'])
    expect(order).toEqual(['view:ot', 'view:lt', 'personal'])
    const personalAt = order.indexOf('personal')
    expect(personalAt).toBeGreaterThan(order.lastIndexOf('view:ot'))
    expect(personalAt).toBeGreaterThan(order.lastIndexOf('view:lt'))
    expect(personal).toHaveLength(1)
    expect(workspaces).toEqual([])
  })

  it('does not POST shared workspace layout when only the layout patch changes', async () => {
    const { deps, views, workspaces } = trackingDeps()
    await persistWorkspaceMigration(workspace(), { ...patch(), name: undefined }, deps)
    expect(views).toEqual(['ot', 'lt'])
    expect(workspaces, 'layout heal must stay personal, not POST /v1/workspaces').toEqual([])
  })

  it('POSTs shared workspace only for a rename, keeping the existing shared layout', async () => {
    const ws = workspace()
    const { deps, workspaces } = trackingDeps()
    await persistWorkspaceMigration(
      ws,
      {
        ...patch(),
        name: 'Renamed',
        layout: { type: 'tabs', views: ['hacked'], active: 0 },
      },
      deps,
    )
    expect(workspaces).toHaveLength(1)
    expect(JSON.stringify(workspaces[0])).toBe(JSON.stringify(ws.layout))
  })

  it('is red against the old layout-first order (layout saved even when create fails)', async () => {
    const { deps, views, workspaces } = trackingDeps('lt')
    await expect(persistWorkspaceMigrationLayoutFirst(workspace(), patch(), deps)).rejects.toThrow('create failed: lt')
    // Old bug: layout already written with the new ids before creates finished.
    expect(workspaces, 'old order incorrectly persists layout before creates').toHaveLength(1)
    expect(views).toEqual(['ot'])
  })
})
