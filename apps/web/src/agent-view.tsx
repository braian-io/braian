import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, SendToBack } from 'lucide-react'
import {
  AgentRunError,
  agentDisplayText,
  agentSessionAccessibleDescription,
  agentSessionHeaderTitle,
  agentStatusLabel,
  backgroundNotices,
  cleanAgentError,
  fetchAgentRun,
  followAgentRun,
  mergeRunSummary,
  patchAgentRun,
  requestAgentNotice,
  requestShowAgentSession,
  type AgentMessage,
  type AgentProposal,
  type AgentRunDetail,
  type AgentRunSummary,
} from './agent-runs'
import { subscribeViewingAgent, viewingAgentRunId } from './agent-session'
import { Button } from './components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from './components/ui/tooltip'
import { formatTimestamp } from './format'
import { copy } from './i18n'
import { reviewOperation } from './review-cells'
import { readAgentFollowDraft, writeAgentFollowDraft } from './agent-follow-draft'
import { runCommand } from './command-registry'
import type { Json } from './api'

type AgentViewProps = {
  runId: string
  title: string
  push: (line: string) => void
}

const focusAgentInputEvent = 'braian-focus-agent-input'

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

function proposalForMessage(message: AgentMessage, proposals: AgentProposal[]): AgentProposal | undefined {
  const id = message.body.proposal_id
  if (!id) return undefined
  return proposals.find((proposal) => proposal.id === id)
}

function openDraft(proposal: AgentProposal) {
  if (proposal.object_id && reviewOperation({ object_id: proposal.object_id, patch: proposal.patch }) === 'update') {
    window.dispatchEvent(new CustomEvent('braian-open-draft', {
      detail: { objectId: proposal.object_id, viewType: 'object_table' },
    }))
    return
  }
  window.dispatchEvent(new CustomEvent('braian-open-proposal', {
    detail: { proposalId: proposal.id },
  }))
}

function chatLines(data: AgentRunDetail): Array<{ key: string; kind: string; node: ReactNode }> {
  const proposalsById = new Map(data.proposals.map((proposal) => [proposal.id, proposal]))
  const lines: Array<{ key: string; kind: string; node: ReactNode }> = []
  for (const message of data.messages) {
    if (message.kind === 'user') {
      const text = String(message.body.text ?? '').trim()
      if (!text) continue
      lines.push({
        key: message.id,
        kind: 'user',
        node: (
          <p className="agent-chat-user" data-testid="agent-chat-user">
            {text}
          </p>
        ),
      })
      continue
    }
    if (message.kind === 'question') {
      const text = agentDisplayText(String(message.body.text ?? ''))
      if (!text) continue
      lines.push({
        key: message.id,
        kind: 'question',
        node: (
          <p className="agent-question" data-testid="agent-question">
            {text}
          </p>
        ),
      })
      continue
    }
    if (message.kind === 'proposal') {
      const proposal = proposalForMessage(message, data.proposals) ?? (
        message.body.proposal_id ? proposalsById.get(message.body.proposal_id) : undefined
      )
      const hint = String(message.body.text ?? '').trim()
      const objectLabel = proposal?.object_key || copy.openDraftInTable
      lines.push({
        key: message.id,
        kind: 'proposal',
        node: (
          <div className="agent-chat-assistant" data-testid="agent-answer">
            {hint ? <p className="agent-line">{hint}</p> : null}
            {proposal ? (
              <Button
                type="button"
                variant="ghost"
                className="agent-result-link"
                data-testid="agent-result-link"
                onClick={() => openDraft(proposal)}
              >
                {objectLabel}
              </Button>
            ) : null}
          </div>
        ),
      })
      continue
    }
    if (message.kind === 'notice') {
      const text = String(message.body.text ?? '').trim()
      if (!text) continue
      lines.push({
        key: message.id,
        kind: 'notice',
        node: (
          <p className="agent-line agent-line-notice muted" data-testid="agent-notice">
            {text}
          </p>
        ),
      })
      continue
    }
    if (message.kind === 'assistant' || message.kind === 'error') {
      const raw = String(message.body.text ?? '')
      const unavailable = /no model is connected|openai_api_key/i.test(raw)
      const text = unavailable ? copy.agentUnavailableHint : agentDisplayText(raw)
      if (!text) continue
      lines.push({
        key: message.id,
        kind: message.kind,
        node: (
          <div className="agent-chat-assistant" data-testid={message.kind === 'assistant' ? 'agent-answer' : 'agent-error-line'}>
            <p className="agent-line">{text}</p>
          </div>
        ),
      })
    }
  }
  return lines
}

export function AgentView({ runId, title: viewTitle }: AgentViewProps) {
  const queryClient = useQueryClient()
  const viewingId = useSyncExternalStore(subscribeViewingAgent, viewingAgentRunId, viewingAgentRunId)
  const rootRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const followRef = useRef<HTMLTextAreaElement>(null)
  const opened = useRef(false)
  const [draft, setDraft] = useState(() => readAgentFollowDraft(runId))
  const [error, setError] = useState('')
  const [announced, setAnnounced] = useState('')
  const previousStatus = useRef('')
  const runQueryKey = ['agent-run', runId, 'pane'] as const
  const run = useQuery({
    // Pane query is separate from any warm create/run-list cache on ['agent-run', id].
    queryKey: runQueryKey,
    queryFn: () => fetchAgentRun(runId),
    refetchOnMount: 'always',
    staleTime: 0,
    gcTime: 0,
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
  const focusInput = () => {
    requestAnimationFrame(() => followRef.current?.focus())
  }
  const modeChange = useMutation({
    mutationFn: (mode: 'foreground' | 'background') => patchAgentRun(runId, { mode }),
    onSuccess: (detail) => {
      // The runs list polls once a second. A foreground trip shorter than that
      // gap never shows up in the previous sample, so the waiting toast is skipped.
      // Announce from the mode change itself, then align the list cache.
      const before = queryClient.getQueryData<AgentRunDetail>(runQueryKey)
      queryClient.setQueryData(runQueryKey, detail)
      queryClient.setQueryData<AgentRunSummary[] | undefined>(['agent-runs'], (current) => mergeRunSummary(current, detail))
      if (before) {
        for (const run of backgroundNotices([before], [detail])) requestAgentNotice(run)
      }
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
      queryClient.setQueryData(runQueryKey, detail)
      setDraft('')
      writeAgentFollowDraft(runId, '')
      setError('')
      refresh()
      focusInput()
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
    focusInput()
  }, [run.data])
  useEffect(() => {
    const onFocus = (event: Event) => {
      const detail = (event as CustomEvent<{ runId?: string }>).detail
      if (detail?.runId && detail.runId !== runId) return
      focusInput()
    }
    window.addEventListener(focusAgentInputEvent, onFocus)
    return () => window.removeEventListener(focusAgentInputEvent, onFocus)
  }, [runId])
  useEffect(() => {
    const log = logRef.current
    if (!log) return
    const link = log.querySelector<HTMLElement>('[data-testid="agent-result-link"]')
    if (!link) {
      log.scrollTop = log.scrollHeight
      return
    }
    const logBox = log.getBoundingClientRect()
    const linkBox = link.getBoundingClientRect()
    if (linkBox.bottom > logBox.bottom) log.scrollTop += linkBox.bottom - logBox.bottom
    else if (linkBox.top < logBox.top) log.scrollTop -= logBox.top - linkBox.top
  }, [run.data?.messages.length, run.data?.status])
  const accessibleTitle = run.data ? agentSessionAccessibleDescription(run.data) : viewTitle
  const heading = run.data ? agentSessionHeaderTitle(run.data) : viewTitle
  if (run.isPending) {
    return (
      <div className="agent-view" data-testid="agent-view" data-run={runId} ref={rootRef}>
        <header className="agent-view-head">
          <h2 data-testid="agent-session-title" title={accessibleTitle} aria-label={accessibleTitle}>{heading}</h2>
        </header>
        <div className="agent-skeleton" data-testid="agent-skeleton" aria-busy="true" aria-live="polite">
          <i />
          <i />
          <i />
        </div>
      </div>
    )
  }
  if (run.isError || !run.data) {
    const missing = run.error instanceof AgentRunError && run.error.status === 404
    return (
      <div className="agent-view" data-testid="agent-view" data-run={runId} ref={rootRef}>
        <header className="agent-view-head">
          <h2 data-testid="agent-session-title" title={accessibleTitle} aria-label={accessibleTitle}>{heading}</h2>
        </header>
        {missing ? (
          <p className="error" role="alert" data-testid="agent-missing">{copy.agentRunMissing}</p>
        ) : (
          <div className="agent-fetch-error" role="alert" data-testid="agent-fetch-error">
            <p>{run.error instanceof Error ? run.error.message : copy.agentRunMissing}</p>
            <Button type="button" data-testid="agent-retry" onClick={() => void run.refetch()}>{copy.agentRetry}</Button>
          </div>
        )}
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
  const lines = chatLines(data)
  return (
    <div
      className="agent-view"
      data-testid="agent-view"
      data-run={data.id}
      data-mode={data.mode}
      data-session-kind={data.session_kind}
      data-hidden={data.hidden ? 'true' : 'false'}
      ref={rootRef}
    >
      <p className="sr-only" aria-live="polite" data-testid="agent-status-live">{announced}</p>
      <header className="agent-view-head">
        <h2 data-testid="agent-session-title" title={accessibleTitle} aria-label={accessibleTitle}>{heading}</h2>
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
                  queryClient.setQueryData(runQueryKey, detail)
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
      <div className="agent-log" data-testid="agent-log" aria-live="polite" aria-busy={working} ref={logRef}>
        {lines.length === 0 ? <p className="muted">{copy.agentEmptyRun}</p> : lines.map((line) => <div key={line.key}>{line.node}</div>)}
        {working ? <p className="agent-working muted" data-testid="agent-working">{copy.agentWorkingPlaceholder}</p> : null}
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
      <form
        className="agent-follow"
        onSubmit={(event) => {
          event.preventDefault()
          const content = draft.trim()
          if (!content || working) return
          follow.mutate(content)
        }}
      >
        <textarea
          ref={followRef}
          data-testid="agent-follow-up"
          className="agent-follow-input"
          rows={2}
          value={draft}
          placeholder={working ? copy.agentWorkingPlaceholder : copy.agentFollowUp}
          disabled={working || follow.isPending}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            writeAgentFollowDraft(runId, next)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              writeAgentFollowDraft(runId, draft)
              event.currentTarget.blur()
              void runCommand('layout:focus:left')
              return
            }
            if (event.key !== 'Enter') return
            if (event.shiftKey) return
            event.preventDefault()
            const content = draft.trim()
            if (!content || working || follow.isPending) return
            follow.mutate(content)
          }}
        />
        <Button
          type="submit"
          variant={!working && !follow.isPending && draft.trim() !== '' ? 'primary' : 'ghost'}
          className="agent-submit"
          data-testid={waiting ? 'agent-resume' : 'agent-send'}
          disabled={working || follow.isPending || draft.trim() === ''}
          aria-label={waiting ? copy.agentResume : copy.agentSend}
        >
          {waiting ? copy.agentResume : copy.agentSend}
        </Button>
      </form>
    </div>
  )
}

export function agentRunId(state: Json | undefined): string {
  return String(state?.run_id ?? '')
}