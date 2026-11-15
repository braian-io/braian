import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import {
  dryRunFrom,
  linkedObjectIds,
  mergeDeleteCounts,
  OPEN_DELETE_OBJECTS,
  type DeleteCounts,
  type DeleteObjectRequest,
} from './delete-objects'
import { copy } from './i18n'
import { clearObjectGone, markObjectGone } from './object-gone'
import { reportWriteError, writeErrorMessage } from './write-error'

type Loaded = { counts: DeleteCounts }

export function DeleteObjectsHost() {
  const queryClient = useQueryClient()
  const [request, setRequest] = useState<DeleteObjectRequest | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<DeleteObjectRequest>).detail
      if (!detail?.ids?.length) return
      generation.current += 1
      setRequest({ ids: [...detail.ids] })
      setLoaded(null)
      setError('')
      setBusy(false)
    }
    window.addEventListener(OPEN_DELETE_OBJECTS, open)
    return () => window.removeEventListener(OPEN_DELETE_OBJECTS, open)
  }, [])

  useEffect(() => {
    if (!request) return
    const current = generation.current
    let cancelled = false
    void Promise.all(request.ids.map(async (id) => {
      const [dry, object] = await Promise.allSettled([
        api.delete('/v1/objects/{id}', { params: { path: { id }, query: { dry_run: true } } }),
        api.get('/v1/objects/{id}', { params: { path: { id } } }),
      ])
      if (dry.status === 'rejected') throw dry.reason
      return {
        id,
        dry: dryRunFrom(dry.value),
        links: object.status === 'fulfilled' ? linkedObjectIds(object.value) : [],
      }
    })).then((rows) => {
      if (cancelled || current !== generation.current) return
      const dryRuns = new Map(rows.map((row) => [row.id, row.dry]))
      const links = new Map(rows.map((row) => [row.id, row.links]))
      setLoaded({ counts: mergeDeleteCounts(request.ids, dryRuns, links) })
    }).catch((reason: unknown) => {
      if (cancelled || current !== generation.current) return
      setError(writeErrorMessage(reason) ?? copy.validation)
    })
    return () => {
      cancelled = true
    }
  }, [request])

  if (!request) return null

  const close = () => {
    if (busy) return
    setRequest(null)
  }

  const confirm = () => {
    if (!loaded || busy) return
    setBusy(true)
    setError('')
    void (async () => {
      const deleted = [...request.ids]
      const skip = new Set(deleted)
      let failed = false
      for (const id of deleted) {
        try {
          await api.delete('/v1/objects/{id}', { params: { path: { id } } })
          markObjectGone(queryClient, id)
        } catch (reason) {
          setError(writeErrorMessage(reason) ?? copy.deleteObjectFailed)
          failed = true
          break
        }
      }
      const invalidateObjectReads = () =>
        queryClient.invalidateQueries({
          queryKey: ['object'],
          predicate: (query) => !skip.has(String(query.queryKey[1] ?? '')),
        })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['objects'] }),
        invalidateObjectReads(),
        queryClient.invalidateQueries({ queryKey: ['search'] }),
        queryClient.invalidateQueries({ queryKey: ['palette'] }),
        queryClient.invalidateQueries({ queryKey: ['trash'] }),
        queryClient.invalidateQueries({ queryKey: ['links'] }),
      ])
      setBusy(false)
      if (!failed) {
        toast(copy.deleteObjectDone, {
          action: {
            label: copy.undo,
            onClick: () => {
              void (async () => {
                for (const id of deleted) {
                  try {
                    await api.post('/v1/trash/{kind}/{id}/undelete', {
                      params: { path: { kind: 'object', id } },
                    })
                    clearObjectGone(queryClient, id)
                  } catch (reason) {
                    reportWriteError(reason)
                    return
                  }
                }
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ['objects'] }),
                  queryClient.invalidateQueries({ queryKey: ['object'] }),
                  queryClient.invalidateQueries({ queryKey: ['search'] }),
                  queryClient.invalidateQueries({ queryKey: ['path-values'] }),
                  queryClient.invalidateQueries({ queryKey: ['trash'] }),
                ])
              })()
            },
          },
        })
        setRequest(null)
      }
    })()
  }

  const counts = loaded?.counts
  const detailLines = counts
    ? [...new Set(counts.detail.filter((line) => line && line !== counts.sentence))]
    : []
  return (
    <Dialog open onOpenChange={(next) => { if (!next) close() }}>
      <DialogContent className="delete-objects" data-testid="delete-object-dialog">
        <DialogTitle>{copy.deleteObjectTitle}</DialogTitle>
        <DialogDescription>{copy.deleteObjectDescription}</DialogDescription>
        {error ? <p className="error" role="alert" data-testid="delete-object-error">{error}</p> : null}
        <p data-testid="delete-object-counts">
          {counts ? counts.sentence : copy.deleteObjectCounting}
        </p>
        {detailLines.length > 0 ? (
          <ul className="hint">
            {detailLines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : null}
        <div className="dialog-actions">
          <Button
            type="button"
            variant="default"
            data-testid="cancel-delete-object"
            disabled={busy}
            autoFocus
            onClick={close}
          >
            {copy.cancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            data-testid="confirm-delete-object"
            disabled={busy || !loaded || Boolean(error)}
            onClick={confirm}
          >
            {copy.delete}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
