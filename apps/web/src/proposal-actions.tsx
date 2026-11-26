import type { KeyboardEvent, MouseEvent } from 'react'
import { Button } from './components/ui/button'
import { copy } from './i18n'

export type ProposalActionRow = { status?: unknown }

function bulkButtonProps(inactive: boolean, explained: boolean, reason: string, onClick: () => void) {
  if (explained && inactive) {
    return {
      'aria-disabled': true as const,
      tabIndex: 0,
      title: reason,
      onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
        }
      },
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
        event.stopPropagation()
      },
    }
  }
  return {
    disabled: inactive,
    onClick,
  }
}

/**
 * Explains why the bulk actions are closed. Only a proposal without pending
 * rows is closed; an open proposal stays actionable even when it is stale.
 * An unknown status is not a reason: the caller shows a loading state until
 * the proposal and its rows are known.
 */
export function closedProposalReason(status: unknown, rows: ProposalActionRow[]): string | null {
  if (rows.some((row) => row.status === 'pending')) return null
  const accepted = rows.some((row) => row.status === 'accepted')
  const rejected = rows.some((row) => row.status === 'rejected')
  if (accepted && rejected) return copy.proposalAlreadyClosed
  const value = String(status ?? '')
  if (value === 'discarded' || (rejected && !accepted)) return copy.proposalAlreadyDiscarded
  if (value === 'accepted' || (accepted && !rejected)) return copy.proposalAlreadyAccepted
  return null
}

export function ProposalBulkActions({
  status,
  rows,
  loading = false,
  stale = false,
  saveDisabled,
  discardDisabled,
  onSave,
  onDiscard,
  saveVariant = 'default',
  saveTestId = 'save-all',
  discardTestId = 'discard-all',
  actionsTestId = 'proposal-actions',
  reasonTestId = 'proposal-actions-reason',
  loadingTestId = 'proposal-actions-loading',
}: {
  status?: unknown
  rows: ProposalActionRow[]
  loading?: boolean
  /** Open proposal whose base moved. Save stays inactive and says why; Discard still works. */
  stale?: boolean
  saveDisabled: boolean
  discardDisabled: boolean
  onSave: () => void
  onDiscard: () => void
  saveVariant?: 'default' | 'primary'
  saveTestId?: string
  discardTestId?: string
  actionsTestId?: string
  reasonTestId?: string
  loadingTestId?: string
}) {
  const closed = loading ? null : closedProposalReason(status, rows)
  const saveReason = closed ?? (!loading && stale ? copy.agentStaleApprove : null)
  const discardReason = closed
  const reason = saveReason ?? discardReason
  const descriptionId = reason ? reasonTestId : undefined
  const saveInactive = loading || saveDisabled
  const discardInactive = loading || discardDisabled
  const settled = Boolean(closed) && !loading
  const save = (
    <Button
      type="button"
      variant={saveVariant}
      data-testid={saveTestId}
      aria-describedby={saveReason ? descriptionId : undefined}
      className={settled && saveInactive ? 'transition-none' : undefined}
      {...bulkButtonProps(saveInactive, Boolean(saveReason), saveReason ?? '', onSave)}
    >
      {copy.saveAll}
    </Button>
  )
  const discard = (
    <Button
      type="button"
      variant={settled && discardInactive ? 'default' : 'danger'}
      data-testid={discardTestId}
      aria-describedby={discardReason ? descriptionId : undefined}
      className={settled && discardInactive ? 'transition-none' : undefined}
      {...bulkButtonProps(discardInactive, Boolean(discardReason), discardReason ?? '', onDiscard)}
    >
      {copy.discardAll}
    </Button>
  )
  return (
    <span className="proposal-actions" data-testid={actionsTestId} title={reason ?? undefined}>
      {save}
      {discard}
      {reason ? (
        <span className="proposal-actions-reason" id={descriptionId} title={reason} data-testid={reasonTestId}>
          {reason}
        </span>
      ) : null}
      {loading ? (
        <span className="proposal-actions-reason" data-testid={loadingTestId}>
          {copy.loadingProposal}
        </span>
      ) : null}
    </span>
  )
}
