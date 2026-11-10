import { Button } from './components/ui/button'
import { copy } from './i18n'

export type ProposalActionRow = { status?: unknown }

/**
 * Explains why the bulk actions are closed. Only a proposal without pending
 * rows is closed; an open proposal stays actionable even when it is stale.
 */
export function closedProposalReason(status: unknown, rows: ProposalActionRow[]): string | null {
  if (rows.some((row) => row.status === 'pending')) return null
  const accepted = rows.some((row) => row.status === 'accepted')
  const rejected = rows.some((row) => row.status === 'rejected')
  if (accepted && rejected) return copy.proposalAlreadyClosed
  if (String(status ?? '') === 'discarded' || (rejected && !accepted)) return copy.proposalAlreadyDiscarded
  if (String(status ?? '') === 'accepted' || (accepted && !rejected)) return copy.proposalAlreadyAccepted
  return copy.proposalAlreadyClosed
}

export function ProposalBulkActions({
  status,
  rows,
  saveDisabled,
  discardDisabled,
  onSave,
  onDiscard,
  discardFirst = false,
  saveVariant = 'default',
  saveTestId = 'save-all',
  discardTestId = 'discard-all',
  reasonTestId = 'proposal-actions-reason',
}: {
  status?: unknown
  rows: ProposalActionRow[]
  saveDisabled: boolean
  discardDisabled: boolean
  onSave: () => void
  onDiscard: () => void
  discardFirst?: boolean
  saveVariant?: 'default' | 'primary'
  saveTestId?: string
  discardTestId?: string
  reasonTestId?: string
}) {
  const reason = closedProposalReason(status, rows)
  const descriptionId = reason ? reasonTestId : undefined
  const save = (
    <Button
      type="button"
      variant={saveVariant}
      data-testid={saveTestId}
      disabled={saveDisabled}
      aria-describedby={descriptionId}
      onClick={onSave}
    >
      {copy.saveAll}
    </Button>
  )
  const discard = (
    <Button
      type="button"
      variant="danger"
      data-testid={discardTestId}
      disabled={discardDisabled}
      aria-describedby={descriptionId}
      onClick={onDiscard}
    >
      {copy.discardAll}
    </Button>
  )
  return (
    <>
      {discardFirst ? discard : save}
      {discardFirst ? save : discard}
      {reason ? (
        <span className="proposal-actions-reason" id={descriptionId} title={reason} data-testid={reasonTestId}>
          {reason}
        </span>
      ) : null}
    </>
  )
}
