export type AgentLayoutView = { id: string; title: string; type: string }

export type AgentToggleDecision =
  | { kind: 'close'; viewIds: string[] }
  | { kind: 'open-compose' }

/** Ctrl+J when the command palette is closed: close any open agent pane, else open a fresh compose thread. */
export function decideAgentToggle(
  openLayoutViewIds: readonly string[],
  agentViews: readonly AgentLayoutView[],
): AgentToggleDecision {
  const open = new Set(openLayoutViewIds)
  const openAgents = agentViews.filter((view) => open.has(view.id))
  if (openAgents.length > 0) {
    return { kind: 'close', viewIds: openAgents.map((view) => view.id) }
  }
  return { kind: 'open-compose' }
}