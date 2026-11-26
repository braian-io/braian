import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type Json } from './api'
import { copy } from './i18n'
import { linkCountNoun, linkEndLabel, type LinkHit } from './link-choices'
import { LinkCreateDialog, type LinkEndpoint } from './link-create-dialog'
import { dispatchLinkDrop, type LinkDropDetail } from './link-drag'
import { LinkObjectPicker } from './link-object-picker'
import { type LinkSubmitResult, type LinkWrite, submitLinks } from './link-write'
import { linkSectionObjectId, publishLinkFeedback } from './link-feedback'
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
  const noteSaved = (result: LinkSubmitResult, detail: LinkDropDetail, linkType?: string) => {
    const saved = result.created.map((item) => ({ ...item, label: peerLabel(detail, item.body) }))
    if (saved.length === 0) return
    refresh()
    const message = result.outcome === 'proposed'
      ? copy.linkedFiled.replace('{linked}', String(saved.length)).replace('{filed}', String(result.filed))
      : linkedMessage(detail.source, detail.targets, saved.length, defs.data)
    const first = saved[0]!
    const sectionObjectId = linkSectionObjectId(detail, first.body)
    const tableObjectIds = [...new Set([
      ...detail.targets.map((item) => item.id),
      detail.source.id,
      sectionObjectId,
    ])]
    publishLinkFeedback({
      sectionObjectId,
      linkType: linkType ?? first.body.type,
      direction: detail.preferred?.direction,
      peerKeys: saved.map((item) => item.label).filter(Boolean),
      hint: message,
      tableObjectIds,
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
          noteSaved(result, drop, requests[0]?.type)
        }
        return result
      }}
      onReplaced={() => {
        refresh()
        const sectionObjectId = drop.preferred?.direction
          ? drop.source.id
          : drop.targets[0]?.id ?? drop.source.id
        publishLinkFeedback({
          sectionObjectId,
          linkType: drop.preferred?.linkType,
          direction: drop.preferred?.direction,
          peerKeys: drop.targets.map((item) => item.key || item.name || item.id),
          hint: copy.linkReplaced,
          tableObjectIds: [drop.source.id, ...drop.targets.map((item) => item.id)],
        })
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
