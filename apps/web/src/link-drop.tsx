import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { api, type Json } from './api'
import { copy } from './i18n'
import { linkCountNoun, linkEndLabel, type LinkHit } from './link-choices'
import { LinkCreateDialog, type LinkEndpoint } from './link-create-dialog'
import { dispatchLinkDrop, type LinkDropDetail } from './link-drag'
import { LinkObjectPicker } from './link-object-picker'
import { type CreatedLink, type LinkSubmitResult, type LinkWrite, submitLinks, undoCreatedLinks } from './link-write'
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
  const undo = (links: CreatedLink[]) => {
    void undoCreatedLinks(links).then((result) => {
      refresh()
      if (result.kept.length > 0) {
        const names = result.kept.map((link) => link.label).filter(Boolean).join(', ')
        toast(copy.undoKept
          .replace('{done}', String(result.undone.length))
          .replace('{total}', String(links.length))
          .replace('{name}', names || result.kept.map((link) => link.id).join(', ')), { duration: 8000 })
      }
      if (result.failed.length > 0) reportWriteError(new Error(result.failed[0]?.message || copy.validation))
    })
  }
  const noteSaved = (result: LinkSubmitResult, detail: LinkDropDetail) => {
    const saved = result.created.map((item) => ({ ...item, label: peerLabel(detail, item.body) }))
    if (saved.length === 0) return
    refresh()
    const message = result.outcome === 'proposed'
      ? copy.linkedFiled.replace('{linked}', String(saved.length)).replace('{filed}', String(result.filed))
      : linkedMessage(detail.source, detail.targets, saved.length, defs.data)
    toast(message, {
      duration: 8000,
      icon: <Check size={16} />,
      action: { label: copy.undo, onClick: () => undo(saved) },
    })
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
        toast(copy.linkReplaced)
      }}
    />
  )
}

function peerLabel(detail: LinkDropDetail, body: LinkWrite) {
  const peerId = body.from_id === detail.source.id ? body.to_id : body.from_id
  const peer = detail.targets.find((item) => item.id === peerId)
    ?? (detail.source.id === peerId ? detail.source : undefined)
  return peer ? (peer.key || linkEndLabel(peer)) : peerId
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
