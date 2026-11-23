import { useEffect, useState } from 'react'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'
import {
  cancelModelTableLeave,
  confirmModelTableLeaveDiscard,
  confirmModelTableLeaveReview,
  modelTableLeaveRequest,
  subscribeModelTableDraft,
} from './model-table-draft'

export function ModelTableLeaveDialog() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => subscribeModelTableDraft(() => {
    setOpen(modelTableLeaveRequest() != null)
  }), [])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) cancelModelTableLeave() }}>
      <DialogContent className="model-table-leave" data-testid="model-table-leave-dialog">
        <DialogTitle>{copy.unsavedTableTitle}</DialogTitle>
        <DialogDescription>{copy.unsavedTableDescription}</DialogDescription>
        <div className="dialog-actions">
          <Button
            type="button"
            variant="default"
            data-testid="model-table-leave-discard"
            disabled={busy}
            autoFocus
            onClick={() => {
              confirmModelTableLeaveDiscard()
              setOpen(false)
            }}
          >
            {copy.discard}
          </Button>
          <Button
            type="button"
            variant="primary"
            data-testid="model-table-leave-review"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void confirmModelTableLeaveReview()
                .finally(() => {
                  setBusy(false)
                  setOpen(modelTableLeaveRequest() == null)
                })
            }}
          >
            {copy.reviewAndSave}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}