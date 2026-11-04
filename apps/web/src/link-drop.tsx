import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type Json } from './api'
import { copy } from './i18n'
import { linkCountNoun, type LinkHit } from './link-choices'
import { LinkCreateDialog, type LinkEndpoint } from './link-create-dialog'
import { dispatchLinkDrop, type LinkDropDetail } from './link-drag'
import { LinkObjectPicker } from './link-object-picker'
import { type LinkSubmitResult, submitLinks } from './link-write'
import { reportWriteError } from './write-error'

export { dispatchLinkDrop }

/** One dialog for a drop on a row, a Detail link section, or “Link selected to…”. */
export function LinkDropHost() {
  const queryClient = useQueryClient()
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions'), staleTime: 60_000 })
  const [drop, setDrop] = useState<LinkDropDetail | null>(null)
  const [picking, setPicking] = useState<LinkEndpoint[] | null>(null)
  useEffect(() => {
    const onDrop = (event: Event) => {
      if (defs.isLoading && !defs.data) return
      const detail = (event as CustomEvent<LinkDropDetail>).detail
      if (!detail?.source?.id || !detail.targets?.length) return
      setPicking(null)
      setDrop(detail)
    }
    const onPick = (event: Event) => {
      if (defs.isLoading && !defs.data) return
      const objects = (event as CustomEvent<{ objects?: LinkEndpoint[] }>).detail?.objects ?? []
      if (objects.length < 2) return
      setPicking(objects)
    }
    window.addEventListener('braian-link-drop', onDrop)
    window.addEventListener('braian-link-pick', onPick)
    return () => {
      window.removeEventListener('braian-link-drop', onDrop)
      window.removeEventListener('braian-link-pick', onPick)
    }
  }, [defs.data, defs.isLoading])
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['object'] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
  }
  const undo = (ids: string[]) => {
    void Promise.all(ids.filter(Boolean).map((id) => api.delete('/v1/links/{id}', { params: { path: { id } } })))
      .then(refresh)
      .catch((reason: unknown) => { reportWriteError(reason) })
  }
  if (picking && !drop) {
    const exclude = picking.map((item) => item.id)
    return (
      <LinkObjectPicker
        sourceId={picking[0]?.id ?? ''}
        excludeIds={exclude}
        defs={defs.data}
        onClose={() => setPicking(null)}
        onChoose={(hit) => {
          setDrop({ source: endpointFromHit(hit), targets: picking })
          setPicking(null)
        }}
      />
    )
  }
  if (!drop) return null
  const first = drop.targets[0]
  if (!first) return null
  return (
    <LinkCreateDialog
      source={drop.source}
      target={first}
      targets={drop.targets}
      defs={defs.data}
      preferred={drop.preferred}
      onClose={() => setDrop(null)}
      onConfirm={async () => undefined}
      onConfirmMany={async (requests) => {
        const result = await submitLinks(requests.map((request) => ({
          type: request.type,
          from_id: request.fromId,
          to_id: request.toId,
          values: request.values,
        })))
        if (result.outcome === 'created') {
          refresh()
          const ids = result.created.map((item) => item.id).filter(Boolean)
          toast(linkedMessage(drop.source, drop.targets, requests.length, defs.data), {
            duration: 8000,
            action: ids.length > 0 ? { label: copy.undo, onClick: () => undo(ids) } : undefined,
          })
        } else if (result.outcome === 'partial' && result.created.length > 0) {
          refresh()
        }
        return result
      }}
    />
  )
}

function endpointFromHit(hit: LinkHit): LinkEndpoint {
  return { id: hit.id, typeKey: hit.typeKey, name: hit.name, key: hit.key }
}

function linkedMessage(source: LinkEndpoint, targets: LinkEndpoint[], count: number, defs?: Json) {
  const shared = targets.every((item) => item.typeKey === targets[0]?.typeKey) ? targets[0]?.typeKey ?? '' : ''
  const what = linkCountNoun(count, defs, shared)
  const name = source.name || source.key || source.id
  return copy.linkedToast.replace('{what}', what).replace('{name}', name)
}
