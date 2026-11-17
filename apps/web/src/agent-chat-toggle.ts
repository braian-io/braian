export type AgentLayoutView = { id: string; title: string; type: string }

export type AgentToggleDecision =
  | { kind: 'close'; viewIds: string[] }
  | { kind: 'reopen-hidden'; viewId: string; title: string }
  | { kind: 'palette-ai' }

/** Ctrl+J when the command palette is closed: close any open agent pane, else reopen or start AI. */
export function decideAgentToggle(
  openLayoutViewIds: readonly string[],
  agentViews: readonly AgentLayoutView[],
): AgentToggleDecision {
  const open = new Set(openLayoutViewIds)
  const openAgents = agentViews.filter((view) => open.has(view.id))
  if (openAgents.length > 0) {
    return { kind: 'close', viewIds: openAgents.map((view) => view.id) }
  }
  const hidden = agentViews.filter((view) => !open.has(view.id))
  if (hidden.length > 0) {
    const view = hidden[hidden.length - 1]!
    return { kind: 'reopen-hidden', viewId: view.id, title: view.title }
  }
  return { kind: 'palette-ai' }
}