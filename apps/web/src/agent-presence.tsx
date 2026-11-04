import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  agentNoticeText,
  backgroundNotices,
  backgroundWorkingCount,
  backgroundWorkingLabel,
  listAgentRuns,
  requestOpenAgentsTable,
  type AgentRunSummary,
} from './agent-runs'
import { copy } from './i18n'

type AgentPresenceProps = {
  enabled: boolean
  onReview: (run: AgentRunSummary) => void
}

/** Compact count of background agents, and a notice when one finishes or waits. */
export function AgentPresence({ enabled, onReview }: AgentPresenceProps) {
  const previous = useRef<AgentRunSummary[] | null>(null)
  const runs = useQuery({
    queryKey: ['agent-runs'],
    queryFn: listAgentRuns,
    enabled,
    refetchInterval: enabled ? 1000 : false,
  })
  useEffect(() => {
    const list = runs.data
    if (!list) return
    const prior = previous.current
    previous.current = list
    if (!prior) return
    for (const run of backgroundNotices(prior, list)) {
      const failed = run.status === 'failed'
      const show = failed ? toast.error : toast
      show(agentNoticeText(run), {
        id: `agent-notice-${run.id}-${run.status}`,
        duration: 20000,
        action: {
          label: copy.agentReviewResults,
          onClick: () => onReview(run),
        },
      })
    }
  }, [onReview, runs.data])
  const count = backgroundWorkingCount(runs.data ?? [])
  if (!enabled || count < 1) return null
  const label = backgroundWorkingLabel(count)
  return (
    <button
      type="button"
      className="agent-bg-indicator"
      data-testid="agent-background-indicator"
      data-count={count}
      aria-live="polite"
      aria-label={label}
      onClick={() => requestOpenAgentsTable()}
    >
      <strong data-testid="agent-background-count">{count}</strong>
      <span>working</span>
    </button>
  )
}
