import type { Json } from './api'
import type { ChipTone } from './chips'
import { copy } from './i18n'
import type { PaletteItem } from './palette-model'
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
  proposal_count?: number
  question?: string | null
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
  patch: { tab_open?: boolean; view_id?: string; mode?: 'foreground' | 'background' },
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

export const openAgentEvent = 'braian-open-agent'
export const openAgentsTableEvent = 'braian-open-agents-table'

export function requestOpenAgent(run: AgentRunSummary) {
  window.dispatchEvent(new CustomEvent(openAgentEvent, { detail: run }))
}

export function requestOpenAgentsTable() {
  window.dispatchEvent(new CustomEvent(openAgentsTableEvent))
}

/** Working, Waiting, Done, or Failed. The tab says "Waiting for you". */
export function agentStatusLabel(status: string, surface: 'tab' | 'table' = 'table'): string {
  if (status === 'working') return copy.agentWorking
  if (status === 'waiting') return surface === 'tab' ? copy.agentWaitingForYou : copy.agentWaiting
  if (status === 'failed') return copy.agentFailed
  if (status === 'done') return copy.agentDone
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

export function agentStatusTone(status: string): ChipTone {
  if (status === 'done') return 'ok'
  if (status === 'failed') return 'danger'
  if (status === 'waiting') return 'accent'
  if (status === 'working') return 'info'
  return 'neutral'
}

export function backgroundWorkingCount(runs: AgentRunSummary[]): number {
  return runs.filter((run) => run.mode === 'background' && run.status === 'working').length
}

export function backgroundWorkingLabel(count: number): string {
  if (count === 1) return copy.agentWorkingOne
  return copy.agentsWorking.replace('{count}', String(count))
}

/** A background run that just finished or started waiting for a decision. */
export function backgroundNotices(previous: AgentRunSummary[], next: AgentRunSummary[]): AgentRunSummary[] {
  const before = new Map(previous.map((run) => [run.id, run]))
  const notices: AgentRunSummary[] = []
  for (const run of next) {
    if (run.mode !== 'background') continue
    if (run.status !== 'done' && run.status !== 'failed' && run.status !== 'waiting') continue
    const prior = before.get(run.id)
    // Missed the working state: the first time we see this background run it already finished or is waiting.
    if (!prior) {
      notices.push(run)
      continue
    }
    const statusChanged = prior.status !== run.status
    const movedToBackgroundWhileWaiting = prior.mode !== 'background' && run.status === 'waiting'
    if (statusChanged || movedToBackgroundWhileWaiting) notices.push(run)
  }
  return notices
}

export function proposalCountLabel(count: number): string {
  if (count === 1) return copy.agentProposalCountOne
  return copy.agentProposalCount.replace('{count}', String(count))
}

export function agentNoticeText(run: { title: string; status: string; proposal_count?: number }): string {
  if (run.status === 'waiting') return copy.agentWaitingNotice.replace('{title}', run.title)
  if (run.status === 'failed') return copy.agentFailedNotice.replace('{title}', run.title)
  return copy.agentFinishedNotice
    .replace('{title}', run.title)
    .replace('{proposals}', proposalCountLabel(run.proposal_count ?? 0))
}

export type AgentNotice = {
  id: string
  text: string
  failed: boolean
  /** Opens this run. The first finished run when several finishes share one toast. */
  run: AgentRunSummary | null
  /** Finished runs review results. A run that is waiting opens so the person can answer. */
  actionLabel: string
}

function noticeActionLabel(status: string): string {
  return status === 'waiting' ? copy.agentAnswer : copy.agentReviewResults
}

/** One toast per run, or a single line when several background runs finish together. */
export function agentNotices(runs: AgentRunSummary[]): AgentNotice[] {
  if (runs.length === 0) return []
  const finished = runs.filter((run) => run.status === 'done')
  if (runs.length > 1 && finished.length === runs.length) {
    const ids = finished.map((run) => run.id).sort().join('-')
    return [{
      id: `agent-notice-finished-${ids}`,
      text: copy.agentsFinished.replace('{count}', String(finished.length)),
      failed: false,
      run: finished[0] ?? null,
      actionLabel: copy.agentReviewResults,
    }]
  }
  return runs.map((run) => ({
    id: `agent-notice-${run.id}-${run.status}`,
    text: agentNoticeText(run),
    failed: run.status === 'failed',
    run,
    actionLabel: noticeActionLabel(run.status),
  }))
}

export function agentsPaletteRoot(): PaletteItem {
  return {
    id: 'agents:open',
    group: 'views',
    title: `${copy.agents} ›`,
    subtitle: copy.agentsOpen,
    keywords: ['agent', 'agents', 'background', 'run'],
    argument: { name: 'id', type: 'agent' },
  }
}

export function agentsTablePaletteItem(): PaletteItem {
  return {
    id: 'agents:table',
    group: 'views',
    title: copy.agentsTable,
    subtitle: copy.agents,
    keywords: ['agent', 'agents', 'table', 'list', 'status'],
  }
}

export function agentPaletteRows(runs: AgentRunSummary[]): PaletteItem[] {
  return runs.map((run) => {
    const question = run.question?.trim() ?? ''
    return {
      id: `agent-run:${run.id}`,
      group: 'views' as const,
      title: run.title,
      subtitle: run.status === 'waiting' && question ? question : '',
      keywords: [run.status, run.mode, agentStatusLabel(run.status), question, 'agent'],
      chips: [{ text: agentStatusLabel(run.status), tone: agentStatusTone(run.status) }],
    }
  })
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
