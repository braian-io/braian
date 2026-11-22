import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'
import type { TrashRow } from './trash-table'

export function TrashPurgeDialog({
  target,
  busy,
  onClose,
  onConfirm,
}: {
  target: TrashRow | null
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const open = Boolean(target)
  const name = target?.name?.trim() || target?.number || target?.id || ''
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent data-testid="trash-purge-dialog">
        <DialogTitle>{copy.trashPurgeTitle}</DialogTitle>
        <DialogDescription>
          {copy.trashPurgeConfirm.replace('{name}', name)}
        </DialogDescription>
        <motionButtons busy={busy} onClose={onClose} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  )
}

function motionButtons({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
      <Button type="button" variant="default" disabled={busy} onClick={onClose}>
        {copy.cancel}
      </Button>
      <Button
        type="button"
        variant="danger"
        data-testid="confirm-trash-purge"
        disabled={busy}
        onClick={onConfirm}
      >
        {copy.trashPurge}
      </Button>
    </div>
  )
}