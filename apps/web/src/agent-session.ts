import type { AgentRunSummary } from './agent-runs'
import type { LayoutDoc } from './layout'

let viewingRunId: string | null = null
let flushHeld = false
const listeners = new Set<() => void>()

export function subscribeViewingAgent(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function viewingAgentRunId() {
  return viewingRunId
}

export function setViewingAgentRun(id: string | null) {
  viewingRunId = id
  for (const listener of listeners) listener()
}

export function holdLayoutFlush(held: boolean) {
  flushHeld = held
}

export function layoutFlushHeld() {
  return flushHeld
}

/** One tab group of the views the agent is working in, plus its own tab when that tab exists. */
export function agentSessionLayout(current: LayoutDoc, viewIds: string[]): LayoutDoc {
  const ids = [...new Set(viewIds.filter((id) => id.length > 0))]
  if (ids.length === 0) return current
  return {
    ...current,
    layout: { type: 'tabs', views: ids, active: 0 },
    focus: ids[0],
    zoom: undefined,
  }
}

/** Purple marker: the agent's user session while it is working, or the hidden session the person is viewing. */
export function markedAgentViewIds(runs: AgentRunSummary[], viewingId: string | null): string[] {
  const ids: string[] = []
  for (const run of runs) {
    const controlling = run.session_kind === 'user' && run.status === 'working'
    const showing = viewingId != null && run.id === viewingId
    if (!controlling && !showing) continue
    const views = run.session?.views ?? []
    for (const id of views) {
      if (id && !ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

export function controllingAgentRuns(runs: AgentRunSummary[]): AgentRunSummary[] {
  return runs.filter((run) => run.session_kind === 'user' && run.status === 'working')
}
