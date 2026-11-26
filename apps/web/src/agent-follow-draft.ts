/** In-memory follow-up drafts per agent run for this browser tab (survives pane close). */
const drafts = new Map<string, string>()

export function readAgentFollowDraft(runId: string): string {
  return drafts.get(runId) ?? ''
}

export function writeAgentFollowDraft(runId: string, text: string) {
  const trimmed = text
  if (!trimmed) drafts.delete(runId)
  else drafts.set(runId, trimmed)
}