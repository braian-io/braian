import { Button } from './components/ui/button'
import { copy } from './i18n'

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
        {copy.reviewAndSave}
      </Button>
    </div>
  )
}
