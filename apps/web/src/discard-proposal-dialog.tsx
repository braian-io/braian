import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'

export function DiscardProposalDialog({
  open,
  title,
  lines,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  lines: string[]
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent className="discard-proposal" data-testid="discard-all-confirm">
        <DialogTitle>{copy.discardProposalTitle}</DialogTitle>
        <DialogDescription>{copy.discardProposalDescription}</DialogDescription>
        <p className="discard-proposal-name" data-testid="discard-all-proposal">{title}</p>
        {lines.length > 0 ? (
          <ul className="proposal-tree" data-testid="discard-all-consequence">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="hint" data-testid="discard-all-consequence">{copy.discardProposalFallback}</p>
        )}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="default"
            data-testid="cancel-discard-all"
            disabled={busy}
            autoFocus
            onClick={onCancel}
          >
            {copy.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            data-testid="confirm-discard-all"
            disabled={busy}
            onClick={onConfirm}
          >
            {copy.discardAll}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
