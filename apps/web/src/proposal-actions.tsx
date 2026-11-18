import type { MouseEvent } from 'react'
import { Button } from './components/ui/button'
import { copy } from './i18n'

export type ProposalActionRow = { status?: unknown }

function bulkButtonProps(inactive: boolean, explained: boolean, reason: string, onClick: () => void) {
  if (explained && inactive) {
    return {
      'aria-disabled': true as const,
      tabIndex: 0,
      title: reason,
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault()
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
  saveDisabled,
  discardDisabled,
  onSave,
  onDiscard,
  discardFirst = false,
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
  saveDisabled: boolean
  discardDisabled: boolean
  onSave: () => void
  onDiscard: () => void
  discardFirst?: boolean
  saveVariant?: 'default' | 'primary'
  saveTestId?: string
  discardTestId?: string
  actionsTestId?: string
  reasonTestId?: string
  loadingTestId?: string
}) {
  const reason = loading ? null : closedProposalReason(status, rows)
  const descriptionId = reason ? reasonTestId : undefined
  const explained = Boolean(reason)
  const saveInactive = loading || saveDisabled
  const discardInactive = loading || discardDisabled
  const save = (
    <Button
      type="button"
      variant={saveVariant}
      data-testid={saveTestId}
      aria-describedby={descriptionId}
      {...bulkButtonProps(saveInactive, explained, reason ?? '', onSave)}
    >
      {copy.saveAll}
    </Button>
  )
  const discard = (
    <Button
      type="button"
      variant="danger"
      data-testid={discardTestId}
      aria-describedby={descriptionId}
      {...bulkButtonProps(discardInactive, explained, reason ?? '', onDiscard)}
    >
      {copy.discardAll}
    </Button>
  )
  return (
    <span className="proposal-actions" data-testid={actionsTestId} title={reason ?? undefined}>
      {discardFirst ? discard : save}
      {discardFirst ? save : discard}
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
