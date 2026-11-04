import type { Json } from './api'
import { copy } from './i18n'
import type { UiContextSnapshot } from './ui-context'

export type AgentRunSummary = {
  id: string
  title: string
  status: string
  mode: string
  session_kind: string
  hidden: boolean
  tab_open: boolean
  view_id?: string | null
  workspace_id?: string | null
  error?: string | null
  created_at: string
  updated_at: string
  finished_at?: string | null
}

export type AgentMessage = {
  id: string
  kind: string
  body: { text?: string; proposal_id?: string; available?: boolean }
  created_at: string
}

export type AgentProposal = {
  id: string
  title: string
  status: string
  stale: boolean
  stale_reason?: string | null
  object_id?: string | null
  object_key?: string | null
  patch?: Json
  resolved_at?: string | null
  reverted_at?: string | null
}

export type AgentRunDetail = AgentRunSummary & {
  messages: AgentMessage[]
  proposals: AgentProposal[]
}

export class AgentRunError extends Error {
  status: number

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

async function parse(response: Response): Promise<Json> {
  const body = (await response.json().catch(() => ({}))) as Json
  if (!response.ok) {
    const detail = typeof body.detail === 'string' ? body.detail : response.statusText
    throw new AgentRunError(response.status, detail || 'The agent run could not be saved.')
  }
  return body
}

export async function createAgentRun(input: {
  messages: Array<{ role: string; content: string }>
  context: UiContextSnapshot
  workspace_id?: string | null
}): Promise<AgentRunDetail> {
  const response = await fetch('/v1/agent/runs', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: input.messages,
      context: input.context,
      workspace_id: input.workspace_id ?? undefined,
    }),
  })
  return (await parse(response)) as AgentRunDetail
}

export async function listAgentRuns(): Promise<AgentRunSummary[]> {
  const response = await fetch('/v1/agent/runs', { credentials: 'include' })
  const body = await parse(response)
  return ((body.runs as AgentRunSummary[] | undefined) ?? [])
}

export async function fetchAgentRun(id: string): Promise<AgentRunDetail> {
  const response = await fetch(`/v1/agent/runs/${id}`, { credentials: 'include' })
  return (await parse(response)) as AgentRunDetail
}

export async function patchAgentRun(
  id: string,
  patch: { tab_open?: boolean; view_id?: string },
): Promise<AgentRunDetail> {
  const response = await fetch(`/v1/agent/runs/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  return (await parse(response)) as AgentRunDetail
}

export async function followAgentRun(id: string, content: string): Promise<AgentRunDetail> {
  const response = await fetch(`/v1/agent/runs/${id}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  return (await parse(response)) as AgentRunDetail
}

/** The same fallback the palette used when no model is connected. */
export function agentDisplayText(text: string): string {
  if (/no model is connected|openai_api_key/i.test(text)) return copy.agentUnavailable
  return text
}

/** Drop transport noise so a failed run shows one readable line. */
export function cleanAgentError(text: string): string {
  if (/no model is connected|openai_api_key/i.test(text)) return copy.agentUnavailable
  const cleaned = text
    .replace(/^openai error:\s*/i, '')
    .replace(/\s*\(status \d+\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (/model request failed/i.test(cleaned)) return copy.agentModelFailed
  return cleaned || copy.agentFailed
}

/** Tab label. The full prompt stays on the tooltip. */
export function agentTabTitle(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= 48) return trimmed
  const cut = trimmed.slice(0, 48)
  const space = cut.lastIndexOf(' ')
  const base = space > 16 ? cut.slice(0, space) : cut
  return `${base}…`
}

export function agentRunPrompt(run: { title: string; messages?: AgentMessage[] }): string {
  const text = run.messages?.find((message) => message.kind === 'user')?.body.text
  if (typeof text === 'string' && text.trim()) return text.trim()
  return run.title
}

/** Open tabs for this workspace, and open tabs that belong somewhere else. */
export function agentRunsForWorkspace(runs: AgentRunSummary[], workspaceId: string) {
  const here: AgentRunSummary[] = []
  const elsewhere: AgentRunSummary[] = []
  for (const run of runs) {
    if (!run.tab_open) continue
    if (!run.workspace_id || run.workspace_id === workspaceId) here.push(run)
    else elsewhere.push(run)
  }
  return { here, elsewhere }
}
