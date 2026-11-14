import { Button } from './components/ui/button'
import { copy } from './i18n'
import type { UnmappedProposal } from './review-cells'

const UNMAPPED_LABEL = {
  create: copy.unmappedDraftCreate,
  delete: copy.unmappedDraftDelete,
  model: copy.unmappedDraftModel,
} as const

/**
 * A create, delete, or model draft has no ordinary object cell after the agent
 * panel cards were removed. Keep a visible path into the proposal review.
 */
export function UnmappedDraftLinks({ proposals }: { proposals: UnmappedProposal[] }) {
  if (proposals.length === 0) return null
  return (
    <div className="draft-unmapped" data-testid="unmapped-proposals">
      {proposals.map((proposal) => (
        <span key={proposal.proposalId} className="draft-unmapped-row">
          <span>{UNMAPPED_LABEL[proposal.reason]}</span>
          <Button
            type="button"
            variant="ghost"
            data-testid={`review-unmapped-${proposal.proposalId}`}
            onClick={() => window.dispatchEvent(new CustomEvent('braian-open-proposal', {
              detail: { proposalId: proposal.proposalId },
            }))}
          >
            {copy.reviewDraft}{proposal.title ? `: ${proposal.title}` : ''}
          </Button>
        </span>
      ))}
    </div>
  )
}

export function CellDiff({
  original,
  proposed,
  testId = 'cell-diff',
}: {
  original?: string
  proposed: string
  testId?: string
}) {
  if (original === undefined) return <>{proposed}</>
  return (
    <span data-testid={testId} data-draft="true">
      <span className="diff-old">{original || '—'}</span>
      <span className="diff-arrow">{' → '}</span>
      <span className="diff-new">{proposed || '—'}</span>
    </span>
  )
}

export function ObjectDraftBar({
  count,
  canSave,
  canDiscard,
  saveReason,
  discardReason,
  pending,
  onSave,
  onDiscard,
}: {
  count: number
  canSave: boolean
  canDiscard: boolean
  saveReason: string
  discardReason: string
  pending?: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  if (count <= 0 && !saveReason) return null
  return (
    <div className="draft-bar" data-testid="object-draft-bar" role="status">
      <span>{count} {copy.unsavedChanges}</span>
      {saveReason ? <span className="error" data-testid="review-blocked">{saveReason}</span> : null}
      <Button
        type="button"
        variant="danger"
        data-testid="discard-draft"
        disabled={!canDiscard || pending}
        title={discardReason || undefined}
        onClick={onDiscard}
      >
        {copy.discard}
      </Button>
      <Button
        type="button"
        variant="primary"
        data-testid="review-and-save"
        disabled={!canSave || pending}
        title={saveReason || undefined}
        onClick={onSave}
      >
        {pending ? copy.saving : copy.reviewAndSave}
      </Button>
    </div>
  )
}
