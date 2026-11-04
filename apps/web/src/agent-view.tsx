import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Json } from './api'
import { agentDisplayText, fetchAgentRun, followAgentRun, type AgentRunDetail } from './agent-runs'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { formatTimestamp } from './format'
import { copy } from './i18n'

type AgentViewProps = {
  runId: string
  push: (line: string) => void
}

function statusLabel(status: string): string {
  if (status === 'working') return copy.agentWorking
  if (status === 'waiting') return copy.agentWaiting
  if (status === 'failed') return copy.agentFailed
  if (status === 'done') return copy.agentDone
  return status
}

export function AgentView({ runId, push }: AgentViewProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const run = useQuery({
    queryKey: ['agent-run', runId],
    queryFn: () => fetchAgentRun(runId),
    refetchInterval: (query) => (query.state.data?.status === 'working' ? 400 : 1000),
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['agent-run', runId] })
    void queryClient.invalidateQueries({ queryKey: ['proposal'] })
    void queryClient.invalidateQueries({ queryKey: ['proposals'] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
  }
  const decide = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      if (accept) {
        await api.post('/v1/proposals/{id}/accept', { params: { path: { id } }, body: {} })
      } else {
        await api.post('/v1/proposals/{id}/discard', { params: { path: { id } } })
      }
    },
    onSuccess: (_result, variables) => {
      setError('')
      push(variables.accept ? copy.saved : copy.discard)
      refresh()
    },
    onError: (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : copy.validation
      setError(message)
      push(message)
      refresh()
    },
  })
  const follow = useMutation({
    mutationFn: (content: string) => followAgentRun(runId, content),
    onSuccess: () => {
      setDraft('')
      setError('')
      refresh()
    },
    onError: (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : copy.validation)
    },
  })
  if (run.isPending) return <p className="muted">{copy.loading}</p>
  if (run.isError || !run.data) {
    return <p className="error" data-testid="agent-error">{copy.agentRunMissing}</p>
  }
  const data: AgentRunDetail = run.data
  const working = data.status === 'working'
  return (
    <div className="agent-view" data-testid="agent-view" data-run={data.id}>
      <header className="agent-view-head">
        <h2>{data.title}</h2>
        <span className="meta-chip" data-testid="agent-status" data-status={data.status}>{statusLabel(data.status)}</span>
        <time dateTime={data.created_at}>{formatTimestamp(data.created_at)}</time>
      </header>
      <div className="agent-log" data-testid="agent-log">
        {data.messages.map((message) => {
          const text = agentDisplayText(String(message.body.text ?? ''))
          if (!text && message.kind !== 'proposal') return null
          if (message.kind === 'proposal') return null
          return (
            <p key={message.id} className={`agent-line agent-line-${message.kind}`} data-testid={message.kind === 'assistant' ? 'agent-answer' : message.kind === 'notice' ? 'agent-notice' : 'agent-line'} data-kind={message.kind}>
              {text}
            </p>
          )
        })}
        {data.messages.length === 0 ? <p className="muted">{copy.agentEmptyRun}</p> : null}
      </div>
      {data.proposals.map((proposal) => (
        <article
          key={proposal.id}
          className="agent-proposal"
          data-testid="agent-proposal"
          data-stale={proposal.stale ? 'true' : 'false'}
        >
          <header>
            <strong>{proposal.title}</strong>
            <span className="meta-chip">{proposal.status}</span>
            {proposal.stale ? <span className="meta-chip" data-testid="agent-proposal-stale">{copy.proposalStale}</span> : null}
          </header>
          {proposal.object_key ? <p className="muted">{proposal.object_key}</p> : null}
          {proposal.stale ? <p data-testid="agent-stale-reason">{proposal.stale_reason || copy.agentProposalStale}</p> : null}
          <div className="toolbar">
            <Button
              type="button"
              data-testid="approve-proposal"
              disabled={proposal.stale || proposal.status !== 'open' || decide.isPending}
              onClick={() => decide.mutate({ id: proposal.id, accept: true })}
            >
              {copy.agentApprove}
            </Button>
            <Button
              type="button"
              variant="danger"
              data-testid="reject-proposal"
              disabled={proposal.status !== 'open' || decide.isPending}
              onClick={() => decide.mutate({ id: proposal.id, accept: false })}
            >
              {copy.agentReject}
            </Button>
          </div>
        </article>
      ))}
      {error ? <p className="error" data-testid="agent-error">{error}</p> : null}
      <form
        className="agent-follow"
        onSubmit={(event) => {
          event.preventDefault()
          const content = draft.trim()
          if (!content || working) return
          follow.mutate(content)
        }}
      >
        <Input
          data-testid="agent-follow-up"
          value={draft}
          placeholder={copy.agentFollowUp}
          disabled={working || follow.isPending}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="primary" disabled={working || follow.isPending || draft.trim() === ''}>
          {copy.agentSend}
        </Button>
      </form>
    </div>
  )
}

export function agentRunId(state: Json | undefined): string {
  return String(state?.run_id ?? '')
}
