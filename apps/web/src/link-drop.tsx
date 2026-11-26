import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { copy } from './i18n'
import { type LinkHit } from './link-choices'
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
  const noteSaved = (result: LinkSubmitResult, _detail: LinkDropDetail) => {
    if (result.created.length === 0 && result.outcome !== 'proposed') return
    refresh()
    void queryClient.invalidateQueries({ queryKey: ['trash'] })
    if (result.outcome === 'partial') {
      reportWriteError(new Error(result.failed.message || copy.validation))
    }
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
        if (result.outcome === 'created' || result.outcome === 'partial' || result.outcome === 'proposed') {
          noteSaved(result, drop)
        }
        return result
      }}
      onReplaced={() => {
        refresh()
        void queryClient.invalidateQueries({ queryKey: ['trash'] })
      }}
    />
  )
}

function endpointFromHit(hit: LinkHit): LinkEndpoint {
  return { id: hit.id, typeKey: hit.typeKey, name: hit.name, key: hit.key }
}

