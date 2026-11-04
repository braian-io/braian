import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'

export function bulkWriteImpact(field: string, count: number) {
  return `This changes ${field} on ${count} objects`
}

export function BulkWriteConfirm({
  open,
  field,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean
  field: string
  count: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <DialogContent data-testid="bulk-write-confirm">
        <DialogTitle>{copy.bulkWrite}</DialogTitle>
        <DialogDescription data-testid="bulk-write-impact">
          {bulkWriteImpact(field, count)}
        </DialogDescription>
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={onCancel}>{copy.cancel}</Button>
          <Button type="button" variant="danger" data-testid="bulk-write-confirm-button" onClick={onConfirm}>
            {copy.confirm}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
