import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { api, catalogName, searchQuery, type Json } from './api'
import { formatCount } from './format'
import {
  assortmentSearchFilter,
  currentSelectionLabels,
  DELETE_SELECTION_EVENT,
  EDIT_SELECTION_EVENT,
  labelCodes,
  NEW_SELECTION_EVENT,
  requestDeleteSelection,
  requestEditSelection,
  requestNewSelection,
  selectionFilterText,
  selectionKind,
  selectionMatchesType,
  selectionQueryValue,
  selectionUsageLines,
  type NewSelectionRequest,
  type SelectionKind,
} from './assortment-filter'
import { Button } from './components/ui/button'
import { openSharedContextMenu } from './shared-context-menu'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { assortmentDisplayName } from './demo-labels'
import { searchDocuments, structureCaption } from './graph-scene'
import { copy, uiLanguage } from './i18n'
import { registerCommandRunner } from './command-registry'
import { typeNames } from './type-labels'

type SelectionSession = {
  group: string | null
  workspaceType?: string | null
  listType?: string | null
  setGroup: (value: string | null) => void
  setObjectId: (value: string | null) => void
  setProposalId: (value: string | null) => void
  push: (line: string) => void
}

function groupChip(group: string, defs?: Json) {
  const splitAt = group.indexOf(':')
  const key = splitAt >= 0 ? group.slice(splitAt + 1) : group
  const structure = splitAt > 0 ? group.slice(0, splitAt) : undefined
  return structureCaption(key, defs, structure)
}

function manualSelectionQuery(session: SelectionSession): Json {
  const labels = currentSelectionLabels()
  return {
    ...(session.group ? { group: session.group } : {}),
    ...(labels.length === 1 ? { labels: labels[0] } : {}),
    ...(labels.length > 1 ? { labels } : {}),
  }
}

export function NewSelectionDialog({ session }: { session: SelectionSession }) {
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const types = typeNames(defs.data, uiLanguage)
  const firstType = types[0]?.key ?? ''
  const workspaceType = session.workspaceType || session.listType || ''
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<SelectionKind>('manual')
  const [typeKey, setTypeKey] = useState(workspaceType)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Json | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open && !typeKey && firstType) setTypeKey(firstType)
  }, [open, typeKey, firstType])

  useEffect(() => {
    const onOpen = (event: Event) => {
      const draft = ((event as CustomEvent<NewSelectionRequest>).detail ?? {}) as NewSelectionRequest
      setEditing(null)
      setName(draft.name ?? '')
      setKind(draft.kind === 'dynamic' ? 'dynamic' : 'manual')
      setQuery(draft.query ?? '')
      setTypeKey(draft.type || workspaceType || firstType)
      setOpen(true)
    }
    const onEdit = (event: Event) => {
      const item = (event as CustomEvent<Json>).detail
      if (!item) return
      setEditing(item)
      setName(String(item.name ?? ''))
      setKind(selectionKind(item.kind))
      setQuery(selectionFilterText(item.query))
      setTypeKey(String(item.type ?? item.type_id ?? (workspaceType || firstType)))
      setOpen(true)
    }
    window.addEventListener(NEW_SELECTION_EVENT, onOpen)
    window.addEventListener(EDIT_SELECTION_EVENT, onEdit)
    return () => {
      window.removeEventListener(NEW_SELECTION_EVENT, onOpen)
      window.removeEventListener(EDIT_SELECTION_EVENT, onEdit)
    }
  }, [workspaceType, firstType])

  const save = async () => {
    const title = name.trim()
    const chosen = typeKey || workspaceType
    if (!title || !chosen) return
    if (kind === 'dynamic' && !query.trim()) {
      session.push(copy.filterQueryRequired)
      return
    }
    const manual = (editing?.query as Json | undefined) ?? manualSelectionQuery(session)
    const body = {
      ...(editing ? { id: String(editing.id) } : {}),
      name: title,
      ...(editing ? {} : { type: chosen }),
      kind,
      query: selectionQueryValue(kind, query, manual),
    }
    try {
      if (editing) {
        await api.put('/v1/assortments/{id}', { params: { path: { id: String(editing.id) } }, body })
      } else {
        await api.post('/v1/assortments', { body })
      }
      session.push(copy.saved)
      setOpen(false)
      setEditing(null)
      setName('')
      void queryClient.invalidateQueries({ queryKey: ['assortments'] })
    } catch (reason) {
      session.push(reason instanceof Error ? reason.message : copy.validation)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-testid="new-selection">
        <DialogTitle className="pr-8">{editing ? copy.editSelection : copy.newSelection}</DialogTitle>
        <DialogDescription>
          {editing
            ? 'Change the name and filter. The kind and object type stay locked.'
            : 'Name a saved selection and choose whether it follows a filter or is filled by hand.'}
        </DialogDescription>
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="model-field">
            <span>{copy.assortment}</span>
            <Input
              data-testid="assortment-name"
              value={name}
              autoFocus
              aria-label={copy.assortment}
              placeholder={copy.assortment}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="model-field">
            <span>{copy.type}</span>
            <select
              aria-label={copy.type}
              data-testid="selection-type"
              value={typeKey}
              disabled={Boolean(editing)}
              onChange={(event) => setTypeKey(event.target.value)}
            >
              {types.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.plural || type.key}
                </option>
              ))}
            </select>
          </label>
          <label className="model-field">
            <span>{copy.selectionKind}</span>
            <select
              aria-label={copy.selectionKind}
              data-testid="selection-kind"
              value={kind}
              disabled={Boolean(editing)}
              onChange={(event) => setKind(selectionKind(event.target.value))}
            >
              <option value="dynamic">{copy.dynamicSelection}</option>
              <option value="manual">{copy.manualSelection}</option>
            </select>
          </label>
          {kind === 'dynamic' ? (
            <label className="model-field">
              <span>{copy.filterQuery}</span>
              <Input
                data-testid="selection-query"
                value={query}
                aria-label={copy.filterQuery}
                placeholder="type_key:=product && groups:=food:cheese"
                onChange={(event) => setQuery(event.target.value)}
              />
              <small>{copy.filterQueryHint}</small>
            </label>
          ) : null}
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {copy.cancel}
            </Button>
            <Button type="submit">{copy.saveAssortment}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteSelectionDialog({ session }: { session: SelectionSession }) {
  const [item, setItem] = useState<Json | null>(null)
  const [deleting, setDeleting] = useState(false)
  const queryClient = useQueryClient()
  const id = String(item?.id ?? '')
  const usage = useQuery({
    queryKey: ['assortment-usage', id],
    queryFn: () => api.get('/v1/assortments/{id}/usage', { params: { path: { id } } }),
    enabled: Boolean(id),
  })
  const lines = selectionUsageLines(usage.data)

  useEffect(() => {
    const onDelete = (event: Event) => {
      const next = (event as CustomEvent<Json>).detail
      if (next) setItem(next)
    }
    window.addEventListener(DELETE_SELECTION_EVENT, onDelete)
    return () => window.removeEventListener(DELETE_SELECTION_EVENT, onDelete)
  }, [])

  const remove = async () => {
    if (!id || deleting) return
    setDeleting(true)
    try {
      await api.delete('/v1/assortments/{id}', { params: { path: { id } } })
      session.push(copy.selectionDeleted)
      setItem(null)
      void queryClient.invalidateQueries({ queryKey: ['assortments'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    } catch (reason) {
      session.push(reason instanceof Error ? reason.message : copy.validation)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={Boolean(item)} onOpenChange={(next) => { if (!next) setItem(null) }}>
      <DialogContent data-testid="delete-selection">
        <DialogTitle className="pr-8">{copy.deleteSelection}</DialogTitle>
        <DialogDescription>{copy.deleteSelectionDetail}</DialogDescription>
        <p className="hint">{String(item?.name ?? '')}</p>
        {usage.isLoading ? (
          <p className="hint">{copy.loading}</p>
        ) : (
          <div className="selection-usage" data-testid="selection-usage">
            {lines.length > 0 ? (
              <>
                <p className="hint">{copy.usedIn}</p>
                <ul>
                  {lines.map((line, index) => (
                    <li key={`${line}-${index}`}>{line}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="hint">{copy.noSelectionUsage}</p>
            )}
          </div>
        )}
        <div className="dialog-actions">
          <Button type="button" variant="ghost" onClick={() => setItem(null)}>
            {copy.cancel}
          </Button>
          <Button type="button" variant="danger" disabled={deleting || usage.isLoading} onClick={() => void remove()}>
            {copy.delete}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SelectionHost({ session }: { session: SelectionSession }) {
  useEffect(() => {
    const offEdit = registerCommandRunner('selection:edit', (target) => {
      const item = target.selection
      if (item && typeof item === 'object' && !Array.isArray(item)) requestEditSelection(item as Json)
    })
    const offDelete = registerCommandRunner('selection:delete', (target) => {
      const item = target.selection
      if (item && typeof item === 'object' && !Array.isArray(item)) requestDeleteSelection(item as Json)
    })
    return () => {
      offEdit()
      offDelete()
    }
  }, [])
  return (
    <>
      <NewSelectionDialog session={session} />
      <DeleteSelectionDialog session={session} />
    </>
  )
}

export function AssortmentList({ session }: { session: SelectionSession }) {
  const typeKey = session.workspaceType || session.listType || ''
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const typeId = typeNames(defs.data, uiLanguage).find((type) => type.key === typeKey)?.id ?? ''
  const list = useQuery({
    queryKey: ['assortments', typeKey],
    queryFn: () => api.get('/v1/assortments', { params: { query: { type: typeKey } } }),
    enabled: Boolean(typeKey),
  })
  const items = (list.data?.assortments ?? []).filter((item) => selectionMatchesType(item, typeKey, typeId))
  const [openId, setOpenId] = useState<string | null>(null)
  const open = items.find((item) => String(item.id) === openId)
  const query = (open?.query as Json) ?? {}
  const dynamicFilter = open ? selectionFilterText(query) : ''
  const filter = open
    ? dynamicFilter || assortmentSearchFilter(query, String(open.type ?? typeKey), defs.data)
    : ''
  const matches = useQuery({
    queryKey: ['assortment-matches', openId, filter],
    queryFn: () => api.get('/v1/search', { params: { query: searchQuery(new URLSearchParams({ filter, per_page: '20' })) } }),
    enabled: Boolean(open && filter),
  })
  const hits = searchDocuments(matches.data ?? {})
  const found = Number(matches.data?.found ?? hits.length)

  const menu = (item: Json, x: number, y: number) => {
    openSharedContextMenu({
      context: 'assortment',
      x,
      y,
      target: { selection: item, selectionId: String(item.id ?? '') },
    })
  }

  return (
    <div className="assortment-list" data-testid="assortment-list">
      <div className="toolbar">
        <Button type="button" data-testid="new-selection-button" onClick={() => requestNewSelection()}>
          {copy.newSelection}
        </Button>
      </div>
      {items.length === 0 ? <p className="hint">{copy.noAssortments}</p> : null}
      <div
        className="assortment-picks"
        tabIndex={0}
        onContextMenu={(event) => {
          event.preventDefault()
          menu({}, event.clientX, event.clientY)
        }}
      >
        {items.map((item) => {
          const id = String(item.id)
          const selected = id === openId
          return (
            <div
              key={id}
              className="assortment-row"
              data-testid="assortment-row"
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                menu(item, event.clientX, event.clientY)
              }}
            >
              <button
                type="button"
                className={selected ? 'on' : ''}
                onClick={() => {
                  setOpenId(id)
                  const next = (item.query as Json) ?? {}
                  session.setGroup(selectionFilterText(next) ? null : next.group ? String(next.group) : null)
                }}
              >
                {assortmentDisplayName(String(item.name ?? ''))}
              </button>
              <button
                type="button"
                className="icon-btn"
                data-testid="selection-menu"
                aria-label={copy.moreActions}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  menu(item, rect.right, rect.bottom)
                }}
              >
                <MoreHorizontal size={14} aria-hidden="true" />
              </button>
            </div>
          )
        })}
      </div>
      {open ? (
        <div data-testid="assortment-open">
          <div className="assortment-query">
            {open.type ? <span className="filter-chip">{String(open.type)}</span> : null}
            {dynamicFilter ? <span className="filter-chip">{dynamicFilter}</span> : null}
            {!dynamicFilter && query.group ? <span className="filter-chip">{groupChip(String(query.group), defs.data)}</span> : null}
            {!dynamicFilter
              ? labelCodes(query.labels).map((code) => (
                  <span key={code} className="filter-chip">{code}</span>
                ))
              : null}
          </div>
          <p className="hint">
            {formatCount(found)} {copy.matchingObjects}
          </p>
          <div className="assortment-hits">
            {hits.map((hit) => {
              const id = String(hit.id ?? '')
              const key = String(hit.key ?? id)
              const label = catalogName(hit, defs.data) || key
              return (
                <button key={id || key} type="button" className="row" onClick={() => session.setObjectId(id)}>
                  <span>{key}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
