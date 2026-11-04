import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, api, textValue, type Json } from './api'
import {
  AgentRunError,
  agentDisplayText,
  cleanAgentError,
  fetchAgentRun,
  followAgentRun,
  type AgentProposal,
  type AgentRunDetail,
} from './agent-runs'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { proposedValues, suggestionLines, type DiffLine } from './field-diff'
import { FieldDiff } from './field-diff-view'
import { formatTimestamp } from './format'
import { copy, uiLanguage } from './i18n'

type AgentViewProps = {
  runId: string
  push: (line: string) => void
}

function statusLabel(status: string): string {
  if (status === 'working') return copy.agentWorking
  if (status === 'waiting') return copy.agentWaiting
  if (status === 'failed') return copy.agentFailed
  if (status === 'done') return copy.agentDone
  if (status === 'open') return copy.agentProposalOpen
  if (status === 'accepted') return copy.agentProposalAccepted
  if (status === 'discarded') return copy.agentProposalDiscarded
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

function decisionText(accept: boolean, lines: DiffLine[]): string {
  const verb = accept ? 'Applied' : 'Rejected'
  if (lines.length === 0) return verb
  const changes = lines
    .map((line) => `${line.label}${line.language ? ` (${line.language})` : ''} → ${line.after || line.before}`)
    .join('; ')
  return `${verb}: ${changes}`
}

function acceptedVersion(result: unknown): number | undefined {
  if (!result || typeof result !== 'object' || !('accepted' in result)) return undefined
  const accepted = (result as { accepted?: unknown }).accepted
  if (!Array.isArray(accepted)) return undefined
  for (const row of accepted) {
    if (!row || typeof row !== 'object' || !('version' in row)) continue
    const version = Number((row as { version?: unknown }).version)
    if (Number.isFinite(version)) return version
  }
  return undefined
}

function restoreValues(current: Json, patch: unknown): Json {
  const proposed = proposedValues(patch)
  const values: Json = {}
  for (const [key, after] of Object.entries(proposed)) {
    const before = current[key]
    if (after && typeof after === 'object' && !Array.isArray(after) && before && typeof before === 'object' && !Array.isArray(before)) {
      const map: Json = {}
      for (const language of Object.keys(after as Json)) map[language] = (before as Json)[language] ?? null
      values[key] = map
      continue
    }
    values[key] = before ?? null
  }
  return values
}

export function AgentView({ runId, push }: AgentViewProps) {
  const queryClient = useQueryClient()
  const rootRef = useRef<HTMLDivElement>(null)
  const followRef = useRef<HTMLInputElement>(null)
  const opened = useRef(false)
  const focusAfter = useRef(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [reverted, setReverted] = useState<Record<string, boolean>>({})
  const [announced, setAnnounced] = useState('')
  const previousStatus = useRef('')
  const run = useQuery({
    queryKey: ['agent-run', runId],
    queryFn: () => fetchAgentRun(runId),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false
      return query.state.data?.status === 'working' ? 400 : 1000
    },
  })
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['agent-run', runId] })
    void queryClient.invalidateQueries({ queryKey: ['proposal'] })
    void queryClient.invalidateQueries({ queryKey: ['proposals'] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
    void queryClient.invalidateQueries({ queryKey: ['object'] })
  }
  const decide = useMutation({
    mutationFn: async (input: { id: string; accept: boolean; lines: DiffLine[]; objectId?: string; restore?: Json }) => {
      if (!input.accept) {
        await api.post('/v1/proposals/{id}/discard', { params: { path: { id: input.id } } })
        return { ...input, version: undefined as number | undefined }
      }
      const result = await api.post('/v1/proposals/{id}/accept', { params: { path: { id: input.id } }, body: {} })
      return { ...input, version: acceptedVersion(result) }
    },
    onSuccess: (input) => {
      setError('')
      const message = decisionText(input.accept, input.lines)
      push(message)
      const version = input.version
      if (input.accept && input.objectId && input.restore && version != null) {
        const objectId = input.objectId
        const restore = input.restore
        toast(message, {
          duration: 5000,
          action: {
            label: copy.undo,
            onClick: () => {
              void api.patch('/v1/objects/{id}', {
                params: { path: { id: objectId }, header: { 'If-Match': version } },
                body: { values: restore },
              }).then(() => {
                setReverted((current) => ({ ...current, [input.id]: true }))
                refresh()
              }).catch((reason: unknown) => {
                if (reason instanceof ApiError && reason.status === 412) {
                  toast(copy.agentUndoConflict)
                  push(copy.agentUndoConflict)
                  return
                }
                const detail = reason instanceof Error ? reason.message : copy.validation
                setError(detail)
                push(detail)
              })
            },
          },
        })
      } else {
        toast(message, { duration: 5000 })
      }
      focusAfter.current = true
      void queryClient.invalidateQueries({ queryKey: ['agent-run', runId] })
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
    onSuccess: (detail) => {
      queryClient.setQueryData(['agent-run', runId], detail)
      setDraft('')
      setError('')
      refresh()
    },
    onError: (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : copy.validation)
    },
  })
  useEffect(() => {
    const status = run.data?.status ?? ''
    if (!status) return
    if (previousStatus.current && previousStatus.current !== status) setAnnounced(statusLabel(status))
    previousStatus.current = status
  }, [run.data?.status])
  useEffect(() => {
    if (!run.data || (opened.current && !focusAfter.current)) return
    const deciding = focusAfter.current
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (opened.current && !deciding) return
        opened.current = true
        focusAfter.current = false
        const root = rootRef.current
        if (!root) return
        const next = root.querySelector<HTMLButtonElement>('[data-testid="approve-proposal"]:not([disabled])')
        const reply = root.querySelector<HTMLInputElement>('[data-testid="agent-follow-up"]')
        ;(next ?? reply)?.focus()
      })
    })
  }, [run.data])
  if (run.isPending) {
    return (
      <div className="agent-skeleton" data-testid="agent-skeleton" aria-busy="true" aria-live="polite">
        <i />
        <i />
        <i />
      </div>
    )
  }
  if (run.isError || !run.data) {
    const missing = run.error instanceof AgentRunError && run.error.status === 404
    if (missing) {
      return <p className="error" role="alert" data-testid="agent-missing">{copy.agentRunMissing}</p>
    }
    const message = run.error instanceof Error ? run.error.message : copy.agentRunMissing
    return (
      <div className="agent-fetch-error" role="alert" data-testid="agent-fetch-error">
        <p>{message}</p>
        <Button type="button" data-testid="agent-retry" onClick={() => void run.refetch()}>{copy.agentRetry}</Button>
      </div>
    )
  }
  const data: AgentRunDetail = run.data
  const working = data.status === 'working'
  const failed = data.status === 'failed'
  const failure = failed ? cleanAgentError(data.error || '') : ''
  const lastPrompt = [...data.messages].reverse().find((message) => message.kind === 'user')
  const retryPrompt = String(lastPrompt?.body.text ?? data.title)
  return (
    <div
      className="agent-view"
      data-testid="agent-view"
      data-run={data.id}
      ref={rootRef}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <p className="sr-only" aria-live="polite" data-testid="agent-status-live">{announced}</p>
      <header className="agent-view-head">
        <h2>{data.title}</h2>
        <span className="meta-chip" data-testid="agent-status" data-status={data.status}>{statusLabel(data.status)}</span>
        <time dateTime={data.created_at}>{formatTimestamp(data.created_at)}</time>
      </header>
      <div className="agent-log" data-testid="agent-log" aria-live="polite" aria-busy={working}>
        {data.messages.map((message) => {
          if (message.kind === 'user' || message.kind === 'proposal' || message.kind === 'notice') return null
          const text = agentDisplayText(String(message.body.text ?? ''))
          if (!text) return null
          return (
            <p key={message.id} className={`agent-line agent-line-${message.kind}`} data-testid={message.kind === 'assistant' ? 'agent-answer' : message.kind === 'notice' ? 'agent-notice' : 'agent-line'} data-kind={message.kind}>
              {text}
            </p>
          )
        })}
        {data.messages.length === 0 ? <p className="muted">{copy.agentEmptyRun}</p> : null}
      </div>
      {data.proposals.map((proposal) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          defs={defs.data}
          pending={decide.isPending}
          reverted={Boolean(reverted[proposal.id])}
          onDecide={(accept, lines, restore) => decide.mutate({
            id: proposal.id,
            accept,
            lines,
            objectId: proposal.object_id ?? undefined,
            restore,
          })}
          onRedo={() => {
            setDraft(copy.agentRedoDraft)
            followRef.current?.focus()
          }}
        />
      ))}
      {failure ? (
        <div className="agent-failed" role="alert" data-testid="agent-run-error">
          <p>{failure}</p>
          <Button
            type="button"
            data-testid="agent-try-again"
            disabled={working || follow.isPending}
            onClick={() => follow.mutate(retryPrompt)}
          >
            {copy.agentTryAgain}
          </Button>
        </div>
      ) : null}
      {error ? <p className="error" role="alert" data-testid="agent-error">{error}</p> : null}
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
          ref={followRef}
          data-testid="agent-follow-up"
          value={draft}
          placeholder={working ? copy.agentWorkingPlaceholder : copy.agentFollowUp}
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

function ProposalCard({
  proposal,
  defs,
  pending,
  reverted,
  onDecide,
  onRedo,
}: {
  proposal: AgentProposal
  defs: Json | undefined
  pending: boolean
  reverted: boolean
  onDecide: (accept: boolean, lines: DiffLine[], restore?: Json) => void
  onRedo: () => void
}) {
  const object = useQuery({
    queryKey: ['object', proposal.object_id],
    queryFn: () => api.get('/v1/objects/{id}', { params: { path: { id: proposal.object_id ?? '' } } }),
    enabled: Boolean(proposal.object_id),
  })
  const current = (object.data?.values as Json | undefined) ?? {}
  const lines = suggestionLines(current, proposal.patch, defs)
  const name = textValue(current.name, uiLanguage) || proposal.object_key || ''
  const open = proposal.status === 'open' && !reverted
  const resolved = reverted
    ? copy.agentReverted
    : proposal.status !== 'open'
      ? `${proposal.status === 'accepted' ? copy.agentApproved : copy.agentRejectedByYou}${proposal.resolved_at ? ` · ${formatTimestamp(proposal.resolved_at)}` : ''}`
      : ''
  return (
    <article
      className="agent-proposal"
      data-testid="agent-proposal"
      data-stale={proposal.stale ? 'true' : 'false'}
      data-status={proposal.status}
    >
      <header>
        {name ? <strong data-testid="agent-proposal-object">{name}</strong> : null}
        {proposal.object_key ? <span className="muted" data-testid="agent-proposal-key">{proposal.object_key}</span> : null}
        <span className="meta-chip">{reverted ? copy.agentReverted : statusLabel(proposal.status)}</span>
        {proposal.stale ? <span className="meta-chip" data-testid="agent-proposal-stale">{copy.proposalStale}</span> : null}
      </header>
      <FieldDiff lines={lines} />
      {proposal.stale ? <p data-testid="agent-stale-reason">{proposal.stale_reason || copy.agentProposalStale}</p> : null}
      {resolved ? <p data-testid="agent-resolved">{resolved}</p> : null}
      {open ? (
        <div className="toolbar">
          <Button
            type="button"
            variant="primary"
            className="agent-approve"
            data-testid="approve-proposal"
            disabled={proposal.stale || pending}
            title={proposal.stale ? copy.agentStaleApprove : undefined}
            onClick={() => onDecide(true, lines, proposal.object_id ? restoreValues(current, proposal.patch) : undefined)}
          >
            {copy.agentApprove}
          </Button>
          <Button
            type="button"
            variant="default"
            data-testid="reject-proposal"
            disabled={pending}
            onClick={() => onDecide(false, lines)}
          >
            {copy.agentReject}
          </Button>
          {proposal.stale ? (
            <Button type="button" variant="ghost" data-testid="agent-redo" onClick={onRedo}>
              {copy.agentRedo}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function agentRunId(state: Json | undefined): string {
  return String(state?.run_id ?? '')
}
