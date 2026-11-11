import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { api, textValue, type Json } from './api'
import { Button } from './components/ui/button'
import { Dialog, DialogContent, DialogDescription } from './components/ui/dialog'
import { formatCount } from './format'
import { copy, uiLanguage } from './i18n'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import { registerCommandRunner } from './command-registry'
import { reportWriteError, writeErrorMessage } from './write-error'
import { LinkAddFlow, type LinkAddRequest } from './link-add'
import { dispatchLinkDrop, endLinkDrag, linkDragActive, linkDragMime, linkDragPayload, linkDropDecision, linkDropFromSection, readLinkDrag, setLinkDragHint } from './link-drag'

type LinkItem = {
  id: string
  peer_id: string
  peer_key: string
  peer_name?: string
  peer_type: string
  has_values: boolean
  sort_order?: string | number | null
  values?: Json
}

type LinkSide = {
  link_type: string
  label: string
  direction: 'out' | 'in'
  /** Type keys the peer must have for this side. */
  targetTypes?: string[]
  links: LinkItem[]
}

type Menu = { id: string; peer: string; hasValues: boolean; x: number; y: number }

type Removal = {
  id: string
  peer: string
  peerId: string
  hasValues: boolean
  linkType: string
  fromId: string
  toId: string
  sortOrder?: string | number | null
  values?: Json
}

let focused: { id: string; peer: string; hasValues: boolean } | null = null

export function LinkSections({
  objectId,
  typeKey,
  objectName,
  objectKey,
  defs,
  defsLoading = false,
  links,
  onOpen,
}: {
  objectId: string
  typeKey: string
  objectName?: string
  objectKey?: string
  defs?: Json
  defsLoading?: boolean
  links: LinkSide[]
  onOpen: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [request, setRequest] = useState<LinkAddRequest | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const [denyKey, setDenyKey] = useState<string | null>(null)
  useEffect(() => {
    const clear = () => {
      setDropKey(null)
      setDenyKey(null)
    }
    window.addEventListener('braian-link-dragend', clear)
    return () => window.removeEventListener('braian-link-dragend', clear)
  }, [])
  const opener = useRef<HTMLElement | null>(null)
  const [confirm, setConfirm] = useState<Removal | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const sections = useMemo(() => sectionsFor(defs, typeKey, links), [defs, typeKey, links])
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const removeRef = useRef<(link: LinkItem, section: LinkSide) => void>(() => undefined)
  // Every list that can show either endpoint or the link itself follows the write.
  const refresh = (peerId?: string) => {
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
  const recreate = (removal: Removal) => {
    const values: Json = removal.values
      ? { ...removal.values }
      : removal.sortOrder == null || removal.sortOrder === ''
        ? {}
        : { sort_order: typeof removal.sortOrder === 'object' ? removal.sortOrder : { value: String(removal.sortOrder) } }
    void api.post('/v1/links', {
      body: { type: removal.linkType, from_id: removal.fromId, to_id: removal.toId, values },
    }).then(() => refresh(removal.peerId)).catch((reason: unknown) => {
      reportWriteError(reason)
    })
  }
  const remove = (link: LinkItem, section: LinkSide) => {
    const removal = removalFor(link, section, objectId)
    if (removal.hasValues) {
      setConfirm(removal)
      setConfirmError('')
      return
    }
    void api.delete('/v1/links/{id}', { params: { path: { id: removal.id } } }).then(() => {
      refresh(removal.peerId)
      toast(copy.linkRemoved, {
        action: { label: copy.undo, onClick: () => recreate(removal) },
      })
    }).catch((reason: unknown) => {
      reportWriteError(reason)
    })
  }
  const confirmRemove = () => {
    if (!confirm) return
    const removal = confirm
    void api.delete('/v1/links/{id}', { params: { path: { id: removal.id } } }).then(() => {
      setConfirm(null)
      setConfirmError('')
      refresh(removal.peerId)
      toast(copy.linkRemoved, {
        action: { label: copy.undo, onClick: () => recreate(removal) },
      })
    }).catch((reason: unknown) => {
      const message = writeErrorMessage(reason)
      if (message) setConfirmError(message)
    })
  }
  removeRef.current = remove
  const openLinkMenu = (link: LinkItem, x: number, y: number) => {
    focused = { id: link.id, peer: link.peer_key, hasValues: link.has_values }
    openSharedContextMenu({
      context: 'link',
      x,
      y,
      target: {
        linkId: link.id,
        peerId: link.peer_id,
        objectId: link.peer_id,
        hasValues: link.has_values,
      },
    })
  }
  useEffect(() => {
    const stops = [
      registerCommandRunner('link:edit', (target) => {
        if (target.linkId) onOpenRef.current(String(target.linkId))
      }),
      registerCommandRunner('link:remove', (target) => {
        if (!target.linkId) return
        const found = locate(sectionsRef.current, String(target.linkId))
        if (found) removeRef.current(found.link, found.section)
      }),
    ]
    return () => stops.forEach((stop) => stop())
  }, [])
  useEffect(() => {
    const add = (event: Event) => {
      const detail = (event as CustomEvent<{ linkType?: string; direction?: 'out' | 'in' }>).detail ?? {}
      const sameType = sections.filter((item) => !detail.linkType || item.link_type === detail.linkType)
      const section =
        sameType.find((item) => !detail.direction || item.direction === detail.direction) ??
        sameType[0] ??
        sections[0]
      if (section) {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        setRequest({ linkType: section.link_type, direction: section.direction })
      }
    }
    const drop = () => {
      if (!focused) return
      const found = locate(sections, focused.id)
      if (found) remove(found.link, found.section)
    }
    window.addEventListener('braian-add-link', add)
    window.addEventListener('braian-remove-link', drop)
    return () => {
      window.removeEventListener('braian-add-link', add)
      window.removeEventListener('braian-remove-link', drop)
    }
  }, [sections])
  return (
    <>
      {sections.map((section) => {
        const key = `${section.link_type}:${section.direction}`
        const markDrop = (event: DragEvent<HTMLElement>) => {
          if (!linkDragActive(event.dataTransfer.types)) return
          const dragged = linkDragPayload()
          const decision = linkDropDecision({
            loading: defsLoading,
            defs,
            anchorType: typeKey,
            draggedTypes: dragged.map((item) => item.typeKey),
          })
          event.preventDefault()
          if (!decision.accept) {
            event.dataTransfer.dropEffect = 'none'
            setDropKey(null)
            setDenyKey(decision.reason === 'denied' ? key : null)
            setLinkDragHint(decision.hint)
            return
          }
          setDenyKey(null)
          setLinkDragHint(null)
          event.dataTransfer.dropEffect = 'copy'
          setDropKey(key)
        }
        const tone = dropKey === key ? ' link-drop' : denyKey === key ? ' link-drop-deny' : ''
        return (
        <section
          key={key}
          className={`field-card${tone}`}
          data-testid="link-section"
          data-link-drop={dropKey === key ? 'true' : undefined}
          data-link-deny={denyKey === key ? 'true' : undefined}
          aria-label={section.label}
          onDragEnter={markDrop}
          onDragOver={markDrop}
          onDragLeave={(event) => {
            if (pointerStillInside(event)) return
            setDropKey((current) => (current === key ? null : current))
            setDenyKey((current) => (current === key ? null : current))
          }}
          onDrop={(event) => {
            if (!linkDragActive(event.dataTransfer.types)) return
            event.preventDefault()
            setDropKey(null)
            setDenyKey(null)
            const dragged = linkDragPayload()
            const decision = linkDropDecision({
              loading: defsLoading,
              defs,
              anchorType: typeKey,
              draggedTypes: dragged.map((item) => item.typeKey),
            })
            if (!decision.accept) {
              endLinkDrag()
              return
            }
            const detail = linkDropFromSection({
              object: { id: objectId, typeKey, name: objectName, key: objectKey },
              dragged: readLinkDrag(event.dataTransfer.getData(linkDragMime)),
              linkType: section.link_type,
              direction: section.direction,
            })
            endLinkDrag()
            if (detail) dispatchLinkDrop(detail)
          }}
        >
          <h3>{section.label} ({formatCount(section.links.length)})</h3>
          {section.links.map((link) => (
            <div
              key={link.id}
              className="row"
              role="row"
              tabIndex={0}
              data-testid="link-row"
              data-peer={link.peer_key}
              onFocus={() => {
                focused = { id: link.id, peer: link.peer_key, hasValues: link.has_values }
              }}
              onContextMenu={(event) => {
                if (prefersNativeContextMenu(event.target)) return
                event.preventDefault()
                openLinkMenu(link, event.clientX, event.clientY)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  openLinkMenu(link, rect.left, rect.bottom)
                }
                if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                  event.preventDefault()
                  onOpen(link.peer_id)
                }
              }}
            >
              <span>{link.peer_key}</span>
            </div>
          ))}
          <Button
            type="button"
            variant="default"
            data-testid="add-link"
            onClick={(event) => {
              opener.current = event.currentTarget
              setRequest({ linkType: section.link_type, direction: section.direction })
            }}
          >
            {copy.addLink}
          </Button>
        </section>
        )
      })}
      {request ? (
        <LinkAddFlow
          objectId={objectId}
          typeKey={typeKey}
          defs={defs}
          request={request}
          source={{ key: objectKey, name: objectName }}
          links={links}
          onClose={() => {
            setRequest(null)
            restoreFocus(opener.current)
          }}
          onChanged={(peerId) => refresh(peerId)}
        />
      ) : null}
      {confirm ? (
        <Dialog open onOpenChange={(next) => { if (!next) setConfirm(null) }}>
          <DialogContent
            data-testid="link-confirm"
            aria-label={copy.removeLink}
            onEscapeKeyDown={(event) => event.stopPropagation()}
          >
            <DialogDescription asChild>
              <p>{copy.confirmRemoveLink.replace('{peer}', confirm.peer)}</p>
            </DialogDescription>
            {confirmError ? <p className="error" data-testid="link-confirm-error">{confirmError}</p> : null}
            <div className="toolbar">
              <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>{copy.cancel}</Button>
              <Button type="button" variant="danger" data-testid="link-confirm-remove" onClick={confirmRemove}>{copy.removeLink}</Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

function pointerStillInside(event: DragEvent<HTMLElement>) {
  if (event.clientX === 0 && event.clientY === 0) return true
  const next = event.relatedTarget
  if (next instanceof Node && (event.currentTarget.contains(next) || next === event.currentTarget)) return true
  const box = event.currentTarget.getBoundingClientRect()
  return event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom
}

function restoreFocus(node: HTMLElement | null) {
  window.setTimeout(() => {
    if (node?.isConnected) node.focus()
  }, 0)
}

export function linkChoices(defs: Json | undefined, typeKey: string) {
  return sectionsFor(defs, typeKey, []).map((section) => ({
    key: section.link_type,
    label: section.label,
    direction: section.direction,
    targetTypes: section.targetTypes ?? [],
  }))
}

function sectionsFor(defs: Json | undefined, typeKey: string, links: LinkSide[]): LinkSide[] {
  const types = ((defs?.types as Json[]) ?? []).filter((item) => item.kind === 'link')
  const mine = types.filter((item) => {
    const spec = item.link as Json | undefined
    return idList(defs, spec?.from_types).includes(typeKey) || idList(defs, spec?.to_types).includes(typeKey)
  })
  const rows: LinkSide[] = []
  for (const item of mine) {
    const key = String(item.key ?? '')
    const spec = item.link as Json | undefined
    if (idList(defs, spec?.from_types).includes(typeKey)) {
      rows.push(existing(links, key, 'out', labelOf(spec?.to_label, key), idList(defs, spec?.to_types)))
    }
    if (idList(defs, spec?.to_types).includes(typeKey)) {
      rows.push(existing(links, key, 'in', labelOf(spec?.from_label, key), idList(defs, spec?.from_types)))
    }
  }
  return rows
}

function existing(
  links: LinkSide[],
  linkType: string,
  direction: 'out' | 'in',
  label: string,
  targetTypes: string[],
): LinkSide {
  const found = links.find((item) => item.link_type === linkType && item.direction === direction)
  return found ? { ...found, label, targetTypes } : { link_type: linkType, label, direction, targetTypes, links: [] }
}

function idList(defs: Json | undefined, ids: unknown) {
  const types = (defs?.types as Json[]) ?? []
  return ((ids as unknown[]) ?? []).map((id) => {
    const match = types.find((item) => String(item.id) === String(id))
    return String(match?.key ?? id)
  })
}

function labelOf(label: unknown, fallback: string) {
  const map = (label as Json | undefined)?.labels
  return textValue(map as Json, uiLanguage) || textValue(map as Json, 'en') || fallback
}

function locate(sections: LinkSide[], id: string): { link: LinkItem; section: LinkSide } | null {
  for (const section of sections) {
    const link = section.links.find((item) => item.id === id)
    if (link) return { link, section }
  }
  return null
}

function removalFor(link: LinkItem, section: LinkSide, objectId: string): Removal {
  const outgoing = section.direction === 'out'
  return {
    id: link.id,
    peer: link.peer_name || link.peer_key,
    peerId: link.peer_id,
    hasValues: link.has_values,
    linkType: section.link_type,
    fromId: outgoing ? objectId : link.peer_id,
    toId: outgoing ? link.peer_id : objectId,
    sortOrder: link.sort_order,
    values: link.values,
  }
}
