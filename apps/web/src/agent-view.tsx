import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, SendToBack } from 'lucide-react'
import { api, type Json } from './api'
import {
  AgentRunError,
  agentStatusLabel,
  cleanAgentError,
  fetchAgentRun,
  followAgentRun,
  patchAgentRun,
  requestShowAgentSession,
  type AgentRunDetail,
} from './agent-runs'
import { subscribeViewingAgent, viewingAgentRunId } from './agent-session'
import { Button } from './components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip'
import { formatTimestamp } from './format'
import { copy } from './i18n'
import { reviewOperation } from './review-cells'

type AgentViewProps = {
  runId: string
  push: (line: string) => void
}

/** Flat icon action: transparent base, accent-dim hover, tooltip and aria-label. */
function AgentIconButton({
  label,
  testId,
  type = 'button',
  disabled,
  onClick,
  children,
}: {
  label: string
  testId: string
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type={type}
          variant="icon"
          className="agent-action"
          data-testid={testId}
          aria-label={label}
          title={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function statusLabel(status: string): string {
  if (status === 'open') return copy.agentProposalOpen
  if (status === 'accepted') return copy.agentProposalAccepted
  if (status === 'discarded') return copy.agentProposalDiscarded
  return agentStatusLabel(status, 'tab')
}

export function AgentView({ runId, push }: AgentViewProps) {
  const queryClient = useQueryClient()
  const viewingId = useSyncExternalStore(subscribeViewingAgent, viewingAgentRunId, viewingAgentRunId)
  const rootRef = useRef<HTMLDivElement>(null)
  const opened = useRef(false)
  const focusAfter = useRef(false)
  const focusedWaiting = useRef(false)
  const [error, setError] = useState('')
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
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['agent-run', runId] })
    void queryClient.invalidateQueries({ queryKey: ['proposal'] })
    void queryClient.invalidateQueries({ queryKey: ['proposals'] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
    void queryClient.invalidateQueries({ queryKey: ['object'] })
  }
  const modeChange = useMutation({
    mutationFn: (mode: 'foreground' | 'background') => patchAgentRun(runId, { mode }),
    onSuccess: (detail) => {
      queryClient.setQueryData(['agent-run', runId], detail)
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['agent-runs'] })
    },
    onError: (reason: unknown) => {
      setError(reason instanceof Error ? reason.message : copy.validation)
    },
  })
  const follow = useMutation({
    mutationFn: (content: string) => followAgentRun(runId, content),
    onSuccess: (detail) => {
      queryClient.setQueryData(['agent-run', runId], detail)
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
    if (previousStatus.current && previousStatus.current !== status) {
      setAnnounced(status === 'waiting' ? copy.agentWaitingForYou : statusLabel(status))
    }
    previousStatus.current = status
  }, [run.data?.status])
  useEffect(() => {
    if (!run.data || opened.current) return
    opened.current = true
    const frame = requestAnimationFrame(() => {
      const root = rootRef.current
      if (!root) return
      const active = document.activeElement
      if (active && active !== document.body && !root.contains(active)) return
      focusedWaiting.current = run.data?.status === 'waiting'
      focusAfter.current = false
      root.querySelector<HTMLButtonElement>('[data-testid="agent-open-draft"]')?.focus()
    })
    return () => cancelAnimationFrame(frame)
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
  const waiting = data.status === 'waiting'
  const failed = data.status === 'failed'
  const failure = failed ? cleanAgentError(data.error || '') : ''
  const retryPrompt = data.title
  const objectProposal = data.proposals.find((proposal) =>
    proposal.object_id && reviewOperation({ object_id: proposal.object_id, patch: proposal.patch }) === 'update')
  const reviewProposal = objectProposal ?? data.proposals.find((proposal) => proposal.id)
  return (
    <div
      className="agent-view"
      data-testid="agent-view"
      data-run={data.id}
      data-mode={data.mode}
      data-session-kind={data.session_kind}
      data-hidden={data.hidden ? 'true' : 'false'}
      ref={rootRef}
      onKeyDownCapture={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <p className="sr-only" aria-live="polite" data-testid="agent-status-live">{announced}</p>
      <header className="agent-view-head">
        <h2 title={data.title}>{data.title}</h2>
        <span className="meta-chip" data-testid="agent-status" data-status={data.status}>{statusLabel(data.status)}</span>
        <div className="agent-head-actions">
          {data.mode === 'foreground' ? (
            <AgentIconButton
              label={copy.agentRunInBackground}
              testId="agent-mode"
              disabled={modeChange.isPending}
              onClick={() => modeChange.mutate('background')}
            >
              <SendToBack size={14} aria-hidden="true" />
            </AgentIconButton>
          ) : null}
          {data.session_kind === 'own' && (data.session?.views?.length ?? 0) > 0 && viewingId !== data.id ? (
            <AgentIconButton
              label={copy.agentShow}
              testId="agent-show"
              onClick={() => {
                requestShowAgentSession(data)
                void patchAgentRun(data.id, { hidden: false }).then((detail) => {
                  queryClient.setQueryData(['agent-run', runId], detail)
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : copy.validation)
                })
              }}
            >
              <Eye size={14} aria-hidden="true" />
            </AgentIconButton>
          ) : null}
        </div>
        <time dateTime={data.created_at}>{formatTimestamp(data.created_at)}</time>
      </header>
      {data.proposals.some((proposal) => proposal.stale) ? (
        <p data-testid="agent-stale-reason">
          {data.proposals.find((proposal) => proposal.stale)?.stale_reason || copy.agentProposalStale}
        </p>
      ) : null}
      <div className="toolbar">
        <Button
          type="button"
          data-testid="agent-open-draft"
          onClick={() => {
            if (objectProposal?.object_id) {
              window.dispatchEvent(new CustomEvent('braian-open-draft', {
                detail: { objectId: objectProposal.object_id, viewType: 'object_table' },
              }))
              return
            }
            if (reviewProposal) {
              window.dispatchEvent(new CustomEvent('braian-open-proposal', {
                detail: { proposalId: reviewProposal.id },
              }))
              return
            }
            // A waiting run can end without a proposal. Keep the control a real
            // navigation instead of a button that does nothing.
            window.dispatchEvent(new CustomEvent('braian-open-draft', {
              detail: { objectId: null, viewType: 'data_model' },
            }))
          }}
        >
          {objectProposal ? copy.openDraftInTable : reviewProposal ? copy.reviewDraft : copy.dataModel}
        </Button>
      </div>
      {failure ? (
        <div className="agent-failed" role="alert" data-testid="agent-run-error">
          <p>{/no model is connected|openai_api_key/i.test(data.error || '') || failure === copy.agentUnavailable ? copy.agentUnavailableHint : failure}</p>
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
    </div>
  )
}

export function agentRunId(state: Json | undefined): string {
  return String(state?.run_id ?? '')
}
