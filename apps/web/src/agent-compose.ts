import type { Json } from './api'
import type { AgentRunSummary } from './agent-runs'

export function isComposeRun(run: AgentRunSummary): boolean {
  if (run.status !== 'waiting') return false
  return !(run.first_message?.trim())
}

type AgentViewRef = { id: string; type: string; state?: Json }

/** Reuse the newest empty compose run for this workspace when one already exists. */
export function pickEmptyComposeRun(
  runs: readonly AgentRunSummary[],
  workspaceId: string | undefined,
  views: readonly AgentViewRef[],
  openViewIds: readonly string[],
): AgentRunSummary | null {
  const open = new Set(openViewIds)
  const runByViewId = new Map<string, string>()
  for (const view of views) {
    if (view.type !== 'agent') continue
    const runId = String((view.state as Record<string, unknown> | undefined)?.run_id ?? '').trim()
    if (runId) runByViewId.set(view.id, runId)
  }
  const here = runs.filter((run) => {
    if (workspaceId && run.workspace_id && run.workspace_id !== workspaceId) return false
    return isComposeRun(run)
  })
  if (here.length === 0) return null
  const withClosedView = here.find((run) => {
    const viewId = run.view_id?.trim() ?? ''
    if (!viewId || open.has(viewId)) return false
    return runByViewId.get(viewId) === run.id
  })
  if (withClosedView) return withClosedView
  const sorted = [...here].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return sorted[0] ?? null
}