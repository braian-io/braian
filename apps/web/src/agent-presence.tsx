import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  agentNoticeText,
  agentNotices,
  backgroundNotices,
  backgroundWorkingCount,
  backgroundWorkingLabel,
  listAgentRuns,
  requestOpenAgentsTable,
  type AgentRunSummary,
} from './agent-runs'

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
    const pending = backgroundNotices(prior, list)
    const notices = agentNotices(pending)
    const live = document.getElementById('braian-live')
    // The toast may collapse several finishes into one line. The live region still names each run.
    if (live && pending.length > 0) live.textContent = pending.map((run) => agentNoticeText(run)).join('. ')
    for (const notice of notices) {
      const show = notice.failed ? toast.error : toast
      const run = notice.run
      show(notice.text, {
        id: notice.id,
        duration: 20000,
        action: {
          label: notice.actionLabel,
          onClick: () => {
            if (run) onReview(run)
            else requestOpenAgentsTable()
          },
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
