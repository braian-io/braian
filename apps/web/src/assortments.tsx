import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, MoreHorizontal } from 'lucide-react'
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
  selectionFilterText,
  selectionKind,
  selectionMatchesType,
  selectionQueryValue,
  selectionUsageLines,
  type NewSelectionRequest,
} from './assortment-filter'
import {
  discardSelectionDraft,
  getSelectionDraft,
  startEditSelection,
  startNewSelection,
  subscribeSelectionDraft,
  updateSelectionDraft,
} from './selection-draft'
import { Button } from './components/ui/button'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './components/ui/dialog'
import { Input } from './components/ui/input'
import { assortmentDisplayName } from './demo-labels'
import { searchDocuments, structureCaption } from './graph-scene'
import { copy, uiLanguage } from './i18n'
import { registerCommandRunner } from './command-registry'
import { ObjectDraftBar } from './object-draft-bar'
import { typeNames } from './type-labels'
import { writeErrorMessage } from './write-error'

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

/** The Selections view keeps the create and edit draft in its Detail area. */
function SelectionDraftDetail({
  session,
  defs,
  onSaved,
}: {
  session: SelectionSession
  defs?: Json
  onSaved?: (item: Json) => void
}) {
  const draft = useSyncExternalStore(subscribeSelectionDraft, getSelectionDraft, getSelectionDraft)
  const types = typeNames(defs, uiLanguage)
  const firstType = types[0]?.key ?? ''
  const workspaceType = session.workspaceType || session.listType || ''
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const identity = draft ? `${draft.mode}:${draft.id ?? 'new'}` : ''

  useEffect(() => {
    if (identity) nameRef.current?.focus()
  }, [identity])

  useEffect(() => {
    if (!draft) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return
      event.preventDefault()
      discardSelectionDraft()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [draft, saving])

  useEffect(() => {
    if (draft && !draft.type && firstType) updateSelectionDraft({ type: firstType })
  }, [draft, firstType])

  if (!draft) return null
  const editing = draft.mode === 'edit'
  const typeLabel = types.find((type) => type.key === draft.type || type.id === draft.type)?.plural || draft.type

  const save = async () => {
    if (saving) return
    // Fast typing can outrun React state; the input's value is the source of
    // truth so a click immediately after the last key cannot save a prefix.
    const title = (nameRef.current?.value ?? draft.name).trim()
    const chosen = draft.type || workspaceType || firstType
    if (!title || !chosen) return
    if (draft.kind === 'dynamic' && !draft.query.trim()) {
      setError(copy.filterQueryRequired)
      return
    }
    setError('')
    setSaving(true)
    const manual = editing ? draft.manual : manualSelectionQuery(session)
    const body = {
      ...(editing && draft.id ? { id: draft.id } : {}),
      name: title,
      ...(editing ? {} : { type: chosen }),
      kind: draft.kind,
      query: selectionQueryValue(draft.kind, draft.query, manual),
    }
    try {
      const saved = editing && draft.id
        ? await api.put('/v1/assortments/{id}', { params: { path: { id: draft.id } }, body })
        : await api.post('/v1/assortments', { body })
      session.push(copy.saved)
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) onSaved?.(saved as Json)
      void queryClient.invalidateQueries({ queryKey: ['assortments'] })
      discardSelectionDraft()
    } catch (reason) {
      const message = writeErrorMessage(reason)
      if (message) setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="assortment-open selection-detail" data-testid="selection-detail">
      <h3>{editing ? copy.editSelection : copy.newSelection}</h3>
      <p className="hint">
        {editing
          ? 'Change the name and filter. The kind and object type stay locked.'
          : 'Name a saved selection and choose whether it follows a filter or is filled by hand.'}
      </p>
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
            ref={nameRef}
            className="selection-name"
            data-testid="assortment-name"
            value={draft.name}
            aria-label={copy.assortment}
            placeholder={copy.assortment}
            onChange={(event) => updateSelectionDraft({ name: event.target.value })}
          />
        </label>
        <label className="model-field">
          <span>{copy.type}</span>
          {editing ? (
            <span
              className="model-field-locked"
              data-testid="selection-type"
              data-locked="true"
              aria-readonly="true"
              aria-label={copy.type}
            >
              <Lock size={12} aria-hidden="true" />
              <span>{typeLabel}</span>
            </span>
          ) : (
            <select
              aria-label={copy.type}
              data-testid="selection-type"
              value={draft.type}
              onChange={(event) => updateSelectionDraft({ type: event.target.value })}
            >
              {types.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.plural || type.key}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="model-field">
          <span>{copy.selectionKind}</span>
          {editing ? (
            <span
              className="model-field-locked"
              data-testid="selection-kind"
              data-locked="true"
              aria-readonly="true"
              aria-label={copy.selectionKind}
            >
              <Lock size={12} aria-hidden="true" />
              <span>{draft.kind === 'dynamic' ? copy.dynamicSelection : copy.manualSelection}</span>
            </span>
          ) : (
            <select
              aria-label={copy.selectionKind}
              data-testid="selection-kind"
              value={draft.kind}
              onChange={(event) => updateSelectionDraft({ kind: selectionKind(event.target.value) })}
            >
              <option value="dynamic">{copy.dynamicSelection}</option>
              <option value="manual">{copy.manualSelection}</option>
            </select>
          )}
        </label>
        {draft.kind === 'dynamic' ? (
          <label className="model-field">
            <span>{copy.filterQuery}</span>
            <Input
              data-testid="selection-query"
              value={draft.query}
              aria-label={copy.filterQuery}
              placeholder="type_key:=product && groups:=food:cheese"
              onChange={(event) => updateSelectionDraft({ query: event.target.value })}
            />
            <small>{copy.filterQueryHint}</small>
          </label>
        ) : (
          <p className="hint">{copy.manualSelection}</p>
        )}
        {error ? <p className="error" data-testid="selection-error">{error}</p> : null}
        <ObjectDraftBar
          count={1}
          canSave
          canDiscard
          saveReason=""
          discardReason=""
          pending={saving}
          onSave={() => void save()}
          onDiscard={() => {
            setError('')
            discardSelectionDraft()
          }}
        />
      </form>
    </div>
  )
}

export function DeleteSelectionDialog({ session }: { session: SelectionSession }) {
  const [item, setItem] = useState<Json | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
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
      if (next) {
        setError('')
        setItem(next)
      }
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
      setError('')
      setItem(null)
      void queryClient.invalidateQueries({ queryKey: ['assortments'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace'] })
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] })
    } catch (reason) {
      const message = writeErrorMessage(reason)
      if (message) setError(message)
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
        {error ? <p className="error" data-testid="delete-selection-error">{error}</p> : null}
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

function showSelectionView() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('braian-open-draft', {
    detail: { viewType: 'assortment_list' },
  }))
}

export function SelectionHost({ session }: { session: SelectionSession }) {
  const workspaceType = session.workspaceType || session.listType || ''
  useEffect(() => {
    const onNew = (event: Event) => {
      const request = ((event as CustomEvent<NewSelectionRequest>).detail ?? {}) as NewSelectionRequest
      startNewSelection(request, workspaceType)
      showSelectionView()
    }
    const onEdit = (event: Event) => {
      const item = (event as CustomEvent<Json>).detail
      if (!item) return
      startEditSelection(item, workspaceType)
      showSelectionView()
    }
    window.addEventListener(NEW_SELECTION_EVENT, onNew)
    window.addEventListener(EDIT_SELECTION_EVENT, onEdit)
    return () => {
      window.removeEventListener(NEW_SELECTION_EVENT, onNew)
      window.removeEventListener(EDIT_SELECTION_EVENT, onEdit)
    }
  }, [workspaceType])

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
  return <DeleteSelectionDialog session={session} />
}

export function AssortmentList({ session }: { session: SelectionSession }) {
  const typeKey = session.workspaceType || session.listType || ''
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const typeId = typeNames(defs.data, uiLanguage).find((type) => type.key === typeKey)?.id ?? ''
  const draft = useSyncExternalStore(subscribeSelectionDraft, getSelectionDraft, getSelectionDraft)
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
        <Button type="button" data-testid="new-selection-button" onClick={() => startAndShow(session)}>
          {copy.newSelection}
        </Button>
      </div>
      <SelectionDraftDetail
        session={session}
        defs={defs.data}
        onSaved={(item) => setOpenId(String(item.id ?? ''))}
      />
      {items.length === 0 ? <p className="hint">{copy.noAssortments}</p> : null}
      <div className="assortment-picks" tabIndex={0}>
        {items.map((item) => {
          const id = String(item.id)
          const selected = id === openId
          return (
            <div
              key={id}
              className="assortment-row"
              data-testid="assortment-row"
              onContextMenu={(event) => {
                if (prefersNativeContextMenu(event.target)) return
                event.preventDefault()
                event.stopPropagation()
                menu(item, event.clientX, event.clientY)
              }}
            >
              <Button
                type="button"
                variant="ghost"
                className={selected ? 'on' : undefined}
                onClick={() => {
                  setOpenId(id)
                  const next = (item.query as Json) ?? {}
                  session.setGroup(selectionFilterText(next) ? null : next.group ? String(next.group) : null)
                }}
              >
                {assortmentDisplayName(String(item.name ?? ''))}
              </Button>
              <Button
                type="button"
                variant="icon"
                data-testid="selection-menu"
                aria-label={copy.moreActions}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  menu(item, rect.right, rect.bottom)
                }}
              >
                <MoreHorizontal size={14} aria-hidden="true" />
              </Button>
            </div>
          )
        })}
      </div>
      {!draft && open ? (
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

function startAndShow(session: SelectionSession) {
  startNewSelection({}, session.workspaceType || session.listType || '')
  showSelectionView()
}
