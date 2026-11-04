import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { api, textValue, type Json } from './api'
import { Button } from './components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover'
import { formatCount } from './format'
import { copy, uiLanguage } from './i18n'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import { registerCommandRunner } from './command-registry'
import { reportWriteError, writeErrorMessage } from './write-error'

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
  links: LinkItem[]
}

type Menu = { id: string; peer: string; hasValues: boolean; x: number; y: number }

type Removal = {
  id: string
  peer: string
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
  defs,
  links,
  onOpen,
}: {
  objectId: string
  typeKey: string
  defs?: Json
  links: LinkSide[]
  onOpen: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState<LinkSide | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; peer: string } | null>(null)
  const [typed, setTyped] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const sections = useMemo(() => sectionsFor(defs, typeKey, links), [defs, typeKey, links])
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const removeRef = useRef<(link: LinkItem, section: LinkSide) => void>(() => undefined)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['object', objectId] })
    void queryClient.invalidateQueries({ queryKey: ['objects'] })
  }
  const recreate = (removal: Removal) => {
    const values: Json = removal.values
      ? { ...removal.values }
      : removal.sortOrder == null || removal.sortOrder === ''
        ? {}
        : { sort_order: typeof removal.sortOrder === 'object' ? removal.sortOrder : { value: String(removal.sortOrder) } }
    void api.post('/v1/links', {
      body: { type: removal.linkType, from_id: removal.fromId, to_id: removal.toId, values },
    }).then(refresh).catch((reason: unknown) => {
      reportWriteError(reason)
    })
  }
  const remove = (link: LinkItem, section: LinkSide) => {
    const removal = removalFor(link, section, objectId)
    if (removal.hasValues) {
      setConfirm({ id: removal.id, peer: removal.peer })
      setTyped('')
      setConfirmError('')
      return
    }
    void api.delete('/v1/links/{id}', { params: { path: { id: removal.id } } }).then(() => {
      refresh()
      toast(copy.linkRemoved, {
        action: { label: copy.undo, onClick: () => recreate(removal) },
      })
    }).catch((reason: unknown) => {
      reportWriteError(reason)
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
      registerCommandRunner('link:open-peer', (target) => {
        if (target.peerId) onOpenRef.current(String(target.peerId))
      }),
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
      if (section) setAdding(section)
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
        const open = Boolean(
          adding &&
          adding.link_type === section.link_type &&
          adding.direction === section.direction,
        )
        return (
          <section
            key={`${section.link_type}:${section.direction}`}
            className="field-card"
            data-testid="link-section"
            aria-label={section.label}
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
            <Popover
              open={open}
              onOpenChange={(next) => setAdding(next ? section : null)}
            >
              <PopoverTrigger asChild>
                <button type="button" data-testid="add-link">
                  {copy.addLink}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="menu link-picker"
                data-testid="link-picker"
                aria-label={copy.addLink}
                align="start"
              >
                <LinkPicker
                  section={section}
                  objectId={objectId}
                  onCreated={() => {
                    setAdding(null)
                    refresh()
                  }}
                />
              </PopoverContent>
            </Popover>
          </section>
        )
      })}
      {confirm ? (
        <div className="overlay" data-testid="link-confirm">
          <form
            className="dialog"
            role="dialog"
            aria-label={copy.removeLink}
            onSubmit={(event) => {
              event.preventDefault()
              if (typed.trim() !== confirm.peer) return
              setConfirmError('')
              void api.delete('/v1/links/{id}', { params: { path: { id: confirm.id } } }).then(() => {
                setConfirm(null)
                setConfirmError('')
                refresh()
              }).catch((reason: unknown) => {
                const message = writeErrorMessage(reason)
                if (message) setConfirmError(message)
              })
            }}
          >
            <p>{copy.confirmRemoveLink.replace('{peer}', confirm.peer)}</p>
            <input
              data-testid="link-confirm-input"
              aria-label={copy.confirmRemoveLink.replace('{peer}', confirm.peer)}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoFocus
            />
            {typed.trim() === confirm.peer ? (
              <p className="hint" data-testid="link-confirm-match">
                <Check aria-hidden="true" size={14} /> {copy.matches}
              </p>
            ) : null}
            {confirmError ? <p className="error" data-testid="link-confirm-error">{confirmError}</p> : null}
            <div className="toolbar">
              <Button type="button" variant="ghost" onClick={() => setConfirm(null)}>{copy.cancel}</Button>
              <Button type="submit" variant="danger" data-testid="link-confirm-remove" disabled={typed.trim() !== confirm.peer}>{copy.removeLink}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  )
}

function LinkPicker({
  section,
  objectId,
  onCreated,
}: {
  section: LinkSide
  objectId: string
  onCreated: () => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [error, setError] = useState('')
  const found = useQuery({
    queryKey: ['link-search', query],
    queryFn: () => api.get('/v1/search', { params: { query: { q: query, per_page: 8, lang: uiLanguage } } }),
    enabled: query.trim().length > 0,
  })
  const hits = (((found.data?.hits as Json[]) ?? [])
    .map((hit) => (hit.document as Json) ?? hit)
    .filter((row) => String(row.id ?? '') !== objectId))
  const choose = (row: Json) => {
    const peer = String(row.id ?? '')
    if (!peer) return
    const body = section.direction === 'out'
      ? { type: section.link_type, from_id: objectId, to_id: peer, values: {} }
      : { type: section.link_type, from_id: peer, to_id: objectId, values: {} }
    setError('')
    void api.post('/v1/links', { body: body }).then(onCreated).catch((reason: unknown) => {
      const message = writeErrorMessage(reason)
      if (message) setError(message)
    })
  }
  return (
    <>
      <input
        data-testid="link-search"
        autoFocus
        aria-label={copy.addLink}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setActive(0) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((index) => Math.min(hits.length - 1, index + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((index) => Math.max(0, index - 1))
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            const row = hits[active]
            if (row) choose(row)
          }
        }}
      />
      {error ? <p className="error" data-testid="link-picker-error">{error}</p> : null}
      <div role="listbox">
        {hits.map((row, index) => (
          <button
            key={String(row.id)}
            type="button"
            role="option"
            aria-selected={index === active}
            className={index === active ? 'on' : ''}
            onClick={() => choose(row)}
          >
            {String(row.key ?? '')} {textValue(row.name) || textValue(row.a_name)}
          </button>
        ))}
      </div>
    </>
  )
}

export function linkChoices(defs: Json | undefined, typeKey: string) {
  return sectionsFor(defs, typeKey, []).map((section) => ({
    key: section.link_type,
    label: section.label,
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
      rows.push(existing(links, key, 'out', labelOf(spec?.to_label, key)))
    }
    if (idList(defs, spec?.to_types).includes(typeKey)) {
      rows.push(existing(links, key, 'in', labelOf(spec?.from_label, key)))
    }
  }
  return rows
}

function existing(links: LinkSide[], linkType: string, direction: 'out' | 'in', label: string): LinkSide {
  const found = links.find((item) => item.link_type === linkType && item.direction === direction)
  return found ? { ...found, label } : { link_type: linkType, label, direction, links: [] }
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
    hasValues: link.has_values,
    linkType: section.link_type,
    fromId: outgoing ? objectId : link.peer_id,
    toId: outgoing ? link.peer_id : objectId,
    sortOrder: link.sort_order,
    values: link.values,
  }
}
