import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { LinkCreateDialog } from './link-create-dialog'
import { dispatchLinkDrop, type LinkDropDetail } from './link-drag'
import { submitLinks } from './link-write'

export { dispatchLinkDrop }

/** One dialog for a drop on a row or a Detail link section. */
export function LinkDropHost() {
  const queryClient = useQueryClient()
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions'), staleTime: 60_000 })
  const [drop, setDrop] = useState<LinkDropDetail | null>(null)
  useEffect(() => {
    const onDrop = (event: Event) => {
      const detail = (event as CustomEvent<LinkDropDetail>).detail
      if (!detail?.source?.id || !detail.targets?.length) return
      setDrop(detail)
    }
    window.addEventListener('braian-link-drop', onDrop)
    return () => window.removeEventListener('braian-link-drop', onDrop)
  }, [])
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
        const outcome = await submitLinks(requests.map((request) => ({
          type: request.type,
          from_id: request.fromId,
          to_id: request.toId,
          values: request.values,
        })))
        if (outcome === 'created') {
          void queryClient.invalidateQueries({ queryKey: ['object'] })
          void queryClient.invalidateQueries({ queryKey: ['objects'] })
        }
      }}
    />
  )
}
