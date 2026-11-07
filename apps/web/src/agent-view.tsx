import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, SendToBack } from 'lucide-react'
import { api, type Json } from './api'
import {
  AgentRunError,
  agentDisplayText,
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
    if (!run.data) return
    const waiting = run.data.status === 'waiting'
    if (waiting && focusedWaiting.current) return
    if (opened.current && !focusAfter.current && !waiting) return
    let cancel = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancel) return
        const root = rootRef.current
        if (!root) return
        opened.current = true
        focusAfter.current = false
        if (waiting) {
          focusedWaiting.current = true
          root.querySelector<HTMLButtonElement>('[data-testid="agent-open-draft"]')?.focus()
          return
        }
        focusedWaiting.current = false
        root.querySelector<HTMLButtonElement>('[data-testid="agent-open-draft"]')?.focus()
      })
    })
    return () => {
      cancel = true
    }
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
  const lastPrompt = [...data.messages].reverse().find((message) => message.kind === 'user')
  const retryPrompt = String(lastPrompt?.body.text ?? data.title)
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
      <div className="agent-log" data-testid="agent-log" aria-live="polite" aria-busy={working}>
        {data.messages.map((message) => {
          if (message.kind === 'question') {
            const text = agentDisplayText(String(message.body.text ?? ''))
            if (!text) return null
            return (
              <p key={message.id} className="agent-question" data-testid="agent-question">
                {text}
              </p>
            )
          }
          if (message.kind === 'user' || message.kind === 'proposal' || message.kind === 'notice') return null
          const raw = String(message.body.text ?? '')
          const unavailable = /no model is connected|openai_api_key/i.test(raw)
          const setupOnly = data.proposals.length === 0 && !data.messages.some((item) => item.kind === 'question')
          if (unavailable && !setupOnly) return null
          const text = unavailable ? copy.agentUnavailableHint : agentDisplayText(raw)
          if (!text) return null
          return (
            <p key={message.id} className={`agent-line agent-line-${message.kind}`} data-testid={message.kind === 'assistant' ? 'agent-answer' : message.kind === 'notice' ? 'agent-notice' : 'agent-line'} data-kind={message.kind}>
              {text}
            </p>
          )
        })}
        {data.messages.length === 0 ? <p className="muted">{copy.agentEmptyRun}</p> : null}
      </div>
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
            const objectId = data.proposals.find((proposal) => proposal.object_id)?.object_id ?? null
            window.dispatchEvent(new CustomEvent('braian-open-draft', {
              detail: { objectId, viewType: objectId ? 'object_table' : 'data_model' },
            }))
          }}
        >
          {copy.openDraftInTable}
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
