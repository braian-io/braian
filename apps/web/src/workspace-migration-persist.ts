import type { Json } from './api'

export type PersistView = {
  id: string
  type: string
  title: string
  pane?: string
  position?: number
  state: Json
}

export type PersistWorkspace = {
  id: string
  name: string
  locked: boolean
  share_token?: string | null
  layout: Json
  views?: PersistView[] | null
}

export type PersistPatch = {
  name?: string
  views: Array<{ id: string; title: string; state: Json; type?: string }>
  create?: Array<{ id: string; type: string; title: string; state: Json; pane?: string; position?: number }>
  layout?: unknown
}

export type PersistViewBody = {
  id: string
  workspace_id: string
  type: string
  title: string
  pane: string
  position: number
  state: { [key: string]: unknown }
}

export type PersistWorkspaceBody = {
  id: string
  name: string
  locked: boolean
  share_token?: string | null
  layout: { [key: string]: unknown }
}

export type PersistDeps = {
  postView: (body: PersistViewBody) => Promise<unknown>
  postWorkspace: (body: PersistWorkspaceBody) => Promise<unknown>
  /** Personal layout document. Called only after every view write succeeds. */
  putPersonalLayout?: (layout: { [key: string]: unknown }) => Promise<unknown>
  freeObject: (value: object) => { [key: string]: unknown }
}

function viewRows<T>(views: readonly T[] | null | undefined): T[] {
  return views ? [...views] : []
}

/**
 * Persist a workspace migration.
 *
 * View creates and updates run first. The personal layout PUT runs only after
 * those succeed, so a failed create leaves the personal document untouched.
 * Shared POST /v1/workspaces is reserved for an explicit rename and keeps the
 * workspace's existing layout JSON.
 */
export async function persistWorkspaceMigration(
  workspace: PersistWorkspace,
  patch: PersistPatch,
  deps: PersistDeps,
) {
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
    const full = viewRows(workspace.views).find((item) => item.id === view.id)
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
  if (patch.layout && deps.putPersonalLayout) {
    const layout = patch.layout
    await deps.putPersonalLayout(
      deps.freeObject(layout && typeof layout === 'object' ? (layout as object) : { tabs: [] }),
    )
  }
  // Rename only. The layout field stays the shared workspace layout, never a heal.
  if (patch.name && patch.name !== workspace.name) {
    const layout = workspace.layout ?? { tabs: [] }
    await deps.postWorkspace({
      id: workspace.id,
      name: patch.name,
      locked: workspace.locked,
      share_token: workspace.share_token,
      layout: deps.freeObject(layout && typeof layout === 'object' ? (layout as object) : { tabs: [] }),
    })
  }
}
