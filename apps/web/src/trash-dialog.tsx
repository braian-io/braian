import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { copy } from './i18n'
import { writeErrorMessage } from './write-error'

export function TrashDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const trash = useQuery({
    queryKey: ['trash'],
    enabled: open,
    queryFn: () => api.get('/v1/trash'),
  })
  const restore = useMutation({
    mutationFn: (item: { kind: string; id: string }) => api.post('/v1/trash/{kind}/{id}/undelete', {
      params: { path: { kind: item.kind, id: item.id } },
    }),
    onSuccess: async () => {
      toast(copy.trashRestored)
      await queryClient.invalidateQueries()
    },
    onError: (error) => toast(writeErrorMessage(error) ?? copy.trashRestoreFailed),
  })
  const items = trash.data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent data-testid="trash-dialog">
        <DialogTitle>{copy.trash}</DialogTitle>
        <DialogDescription className="sr-only">{copy.trash}</DialogDescription>
        {trash.isError
          ? <p className="muted">{copy.trashRestoreFailed}</p>
          : items.length === 0
            ? <p className="muted">{copy.trashEmpty}</p>
            : (
              <ul className="stack" data-testid="trash-list">
                {items.map((item) => (
                  <li key={`${item.kind}:${item.id}`} className="row" style={{ justifyContent: 'space-between' }}>
                    <span>
                      <span className="muted">{copy.trashKind[item.kind] ?? item.kind}</span>
                      {' '}
                      {item.label ?? item.id}
                    </span>
                    <Button
                      type="button"
                      variant="default"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate({ kind: item.kind, id: item.id })}
                    >
                      {copy.trashRestore}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
      </DialogContent>
    </Dialog>
  )
}
