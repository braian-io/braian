import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, recordNumber, recordTitle, type Json } from './api'
import { uiLanguage } from './i18n'
import { existingLinkPeerIds, type LinkDirection } from './link-choices'
import { LinkCreateDialog, type LinkEndpoint } from './link-create-dialog'
import { LinkObjectPicker } from './link-object-picker'
import { linkChoices } from './link-section'
import { submitLink } from './link-write'

export type LinkAddRequest = {
  linkType?: string
  direction?: LinkDirection
  /** Relation label shown while choosing the peer. */
  label?: string
  /** Present when the graph menu owns the request. */
  objectId?: string
  typeKey?: string
  /** The source object as the graph node already knows it. */
  sourceKey?: string
  sourceName?: string
  /** Node circle + label, in client coordinates. The graph dialog docks away from it. */
  anchor?: Rect
  /** The graph stage, in client coordinates. */
  stage?: Rect
}

export type Rect = { left: number; top: number; right: number; bottom: number }

type LinkChoiceLike = { key: string; label: string; direction: LinkDirection; targetTypes?: string[] }

type LinkSideLike = {
  link_type: string
  direction: string
  links?: Array<{ peer_id: string }>
}

/** The requested relation when it exists; otherwise the first relation this type allows. */
export function chooseLinkChoice<T extends LinkChoiceLike>(
  choices: T[],
  request: Pick<LinkAddRequest, 'linkType' | 'direction'> | null | undefined,
): T | undefined {
  if (!request) return choices[0]
  const sameType = request.linkType ? choices.filter((choice) => choice.key === request.linkType) : choices
  return (
    sameType.find((choice) => !request.direction || choice.direction === request.direction) ??
    sameType[0] ??
    choices.find((choice) => !request.direction || choice.direction === request.direction) ??
    choices[0]
  )
}

function restoreFocus(node: HTMLElement | null) {
  window.setTimeout(() => {
    if (node?.isConnected) node.focus()
  }, 0)
}

/**
 * The shared picker -> confirm flow. The object detail pane and the graph node
 * menu both open it, so a relation, direction, candidates and the final write
 * stay the same.
 */
export function LinkAddFlow({
  objectId,
  typeKey,
  defs,
  request,
  source,
  links,
  onClose,
  onChanged,
}: {
  objectId: string
  typeKey: string
  defs?: Json
  request: LinkAddRequest | null
  /** Key and name when the caller already has them (Detail always does). */
  source?: { key?: string; name?: string }
  /** Existing link sides, so already-linked peers are not offered again. */
  links?: LinkSideLike[]
  onClose: () => void
  onChanged?: (peerId?: string) => void
}) {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<LinkEndpoint | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const choices = useMemo(() => linkChoices(defs, typeKey), [defs, typeKey])
  const active = useMemo(
    () => chooseLinkChoice(choices, request ? { linkType: request.linkType, direction: request.direction } : null),
    [choices, request],
  )
  const needsObject = Boolean(request) && (!source?.key || links === undefined)
  const object = useQuery({
    queryKey: ['object', objectId],
    queryFn: () => api.get('/v1/objects/{id}', { params: { path: { id: objectId } } }),
    enabled: needsObject,
    staleTime: 30_000,
  })
  const sourceKey = source?.key || request?.sourceKey || recordNumber(object.data?.values as Json | undefined)
  const sourceName = source?.name || request?.sourceName || recordTitle(object.data?.values as Json | undefined, uiLanguage)
  const sides = links ?? (object.data?.links as LinkSideLike[] | undefined)
  const existing = useMemo(
    () => existingLinkPeerIds(sides, active?.key, active?.direction),
    [sides, active],
  )
  useEffect(() => {
    setTarget(null)
    if (!request) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [request])
  if (!request || !active) return null
  const refresh = (peerId?: string) => {
    if (onChanged) {
      onChanged(peerId)
      return
    }
    void queryClient.invalidateQueries({ queryKey: ['object', objectId] })
    if (peerId) void queryClient.invalidateQueries({ queryKey: ['object', peerId] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
    void queryClient.invalidateQueries({ queryKey: ['peer-links'] })
    void queryClient.invalidateQueries({ queryKey: ['link-search'] })
    void queryClient.invalidateQueries({ queryKey: ['history', objectId] })
    if (peerId) void queryClient.invalidateQueries({ queryKey: ['history', peerId] })
    void queryClient.invalidateQueries({ queryKey: ['graph', objectId] })
    if (peerId) void queryClient.invalidateQueries({ queryKey: ['graph', peerId] })
  }
  const close = () => {
    setTarget(null)
    onClose()
    restoreFocus(opener.current)
  }
  if (!target) {
    return (
      <LinkObjectPicker
        sourceId={objectId}
        excludeIds={[objectId, ...existing]}
        defs={defs}
        source={{ key: sourceKey, name: sourceName }}
        relation={{ label: active.label, direction: active.direction, targetTypes: active.targetTypes }}
        onClose={close}
        onChoose={(hit) =>
          setTarget({ id: hit.id, typeKey: hit.typeKey, name: hit.name, key: hit.key })
        }
      />
    )
  }
  return (
    <LinkCreateDialog
      source={{ id: objectId, typeKey, key: sourceKey, name: sourceName }}
      target={target}
      defs={defs}
      avoid={request.anchor}
      stage={request.stage}
      preferred={{ linkType: active.key, direction: active.direction }}
      onClose={close}
      onConfirm={async (link) => {
        const outcome = await submitLink({
          type: link.type,
          from_id: link.fromId,
          to_id: link.toId,
          values: link.values,
        })
        if (outcome === 'created') refresh(target.id)
      }}
      onReplaced={() => refresh(target.id)}
    />
  )
}
