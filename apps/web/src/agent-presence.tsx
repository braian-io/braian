import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from './components/ui/button'
import {
  agentNoticeEvent,
  agentNoticeText,
  agentNotices,
  backgroundNotices,
  backgroundWorkingCount,
  backgroundWorkingLabel,
  listAgentRuns,
  requestOpenAgentsTable,
  type AgentNotice,
  type AgentRunSummary,
} from './agent-runs'

type AgentPresenceProps = {
  enabled: boolean
  onReview: (run: AgentRunSummary) => void
}

function showAgentNotices(notices: AgentNotice[], onReview: (run: AgentRunSummary) => void) {
  for (const notice of notices) {
    const run = notice.run
    const open = () => {
      if (run) onReview(run)
      else requestOpenAgentsTable()
    }
    if (notice.failed) {
      toast.error(notice.text, {
        id: notice.id,
        duration: 20000,
        className: 'agent-notice-toast',
        action: { label: notice.actionLabel, onClick: open },
      })
      continue
    }
    if (run?.status === 'waiting') {
      toast(notice.text, {
        id: notice.id,
        duration: 20000,
        className: 'agent-notice-toast',
        action: { label: notice.actionLabel, onClick: open },
      })
      continue
    }
    toast(notice.text, {
      id: notice.id,
      duration: 20000,
      className: 'agent-notice-toast',
      action: { label: notice.actionLabel, onClick: open },
    })
  }
}

/** Compact count of background agents, and a notice when one finishes or waits. */
export function AgentPresence({ enabled, onReview }: AgentPresenceProps) {
  const previous = useRef<AgentRunSummary[] | null>(null)
  const onReviewRef = useRef(onReview)
  onReviewRef.current = onReview
  const runs = useQuery({
    queryKey: ['agent-runs'],
    queryFn: listAgentRuns,
    enabled,
    refetchInterval: enabled ? 1000 : false,
  })
  useEffect(() => {
    const onNotice = (event: Event) => {
      const run = (event as CustomEvent<AgentRunSummary>).detail
      if (!run) return
      showAgentNotices(agentNotices([run]), onReviewRef.current)
    }
    window.addEventListener(agentNoticeEvent, onNotice)
    return () => window.removeEventListener(agentNoticeEvent, onNotice)
  }, [])
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
    showAgentNotices(notices, onReview)
  }, [onReview, runs.data])
  const count = backgroundWorkingCount(runs.data ?? [])
  if (!enabled || count < 1) return null
  const label = backgroundWorkingLabel(count)
  return (
    <Button
      type="button"
      variant="default"
      className="agent-bg-indicator"
      data-testid="agent-background-indicator"
      data-count={count}
      aria-live="polite"
      aria-label={label}
      onClick={() => requestOpenAgentsTable()}
    >
      <strong data-testid="agent-background-count">{count}</strong>
      <span>working</span>
    </Button>
  )
}
