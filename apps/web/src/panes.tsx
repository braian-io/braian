import { isValidElement, useMemo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type DragEvent as ReactDragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { History as HistoryIcon } from 'lucide-react'
import { ApiError, api, catalogName, failureLines, freeObject, jsonRecord, recordNumber, recordTitle, searchQuery, textValue, type Json } from './api'
import { AutoResizeTextarea } from './auto-resize-textarea'
import { messageFromErrorBody, reportWriteError, writeErrorMessage } from './write-error'
import { catalogKeyOf, inCatalog, workspaceCatalogRef } from './catalog-scope'
import { useCatalogIdToKey } from './catalog-list'
import { CreateDialog, requireText, type CreateDialogField } from './create-dialog'
import { createObjectFields, createObjectFieldValues } from './create-object-fields'
import { newObjectBody } from './new-object'
import { attributeByKey, indexSort, readIndexed, sortKeyForColumnId } from './index-fields'
import { cellEditShouldPatch, cellEditValuesBody, isEditingCell, isEditableColumn, resolveCellEditInitial, valueListKeyForColumn, columnBaseKey } from './cell-edit'
import { batchGetObjects } from './batch'
import { MetaChip, optionLabel, statusTone, typeLabel } from './chips'
import { BulkWriteConfirm } from './bulk-write'
import { Button } from './components/ui/button'
import { Dialog, DialogContent } from './components/ui/dialog'
import { Slider } from './components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { Switch } from './components/ui/switch'
import { assortmentDisplayName, jobTypeDisplayTitle } from './demo-labels'
import { onFlash } from './flash'
import { GraphMap } from './graph-map'
import { exportPayload, runExport, saveWorkbook } from './export'
import { diffLines, historyWho, isCreate, proposedValues, relativeTime, sourceLabel, suggestionLines, valuesFromKept, type DiffLine } from './field-diff'
import { formatCount, formatMeasure, formatTimestamp } from './format'
import { PathMenu, type ListedPath } from './path-picker'
import { publishFieldsHost } from './fields-host'
import { fieldCatalogForType, withSystemViewFields } from './fields/catalog'
import { SortableColumnHeader } from './sortable-column-header'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { columnTitle, defaultColumnIdsForType, fieldPathForPath, makeViewColumn, parseColumnId, type ViewColumn } from './fields/columns'
import { EMPTY_CELL } from './fields/qualifiers'
import { columnPrefsHasOverride, fetchColumnPrefs, isHopPath, orderHiddenToDocument, ensureSystemColumns,
  prefsToOrderHidden, saveColumnPrefsKeepalive, type ColumnPrefsDocument, type SystemViewColumn } from './column-prefs'
import { columnPrefsMutationKey, columnPrefsQueryKey, resetColumnPrefs, useSaveColumnPrefs } from './column-prefs-mutation'
import { readPathFromDoc, summarizePathValues } from './path-cell'
import { cellPathValues, fetchPathValues } from './path-values'
import { applyObjectWrite, currentSearchWaitSeq, reconcileObjectWrite } from './object-write'
import {
  discardObjectDraft,
  displayOf,
  draftBaseVersion,
  draftEditorSeed,
  editBaseVersion,
  getObjectDraftSnapshot,
  objectDraftCells,
  overlayValues,
  paintObjectCell,
  reviewCapabilities,
  roleCanWrite,
  stageObjectCell,
  subscribeObjectDrafts,
} from './object-draft'
import { CellDiff, ObjectDraftBar, UnmappedDraftLinks } from './object-draft-bar'
import { draftSavePlan, isDraftSaveInFlight, runDraftDiscard, runDraftSave } from './object-draft-save'
import { useObjectDraftSaving } from './use-object-draft-saving'
import { useOpenObjectProposals } from './use-open-proposals'
import { shouldHoldTablePaint, shouldRefreshTableSnapshot } from './table-live-paint'
import { searchPeerArticles, type PeerPickOption } from './peer-search'
import { linkedPeerIds } from './peer-source'
import { isExplicitAllSource, peerEmptyState, peerIdsFilter, peerNodeFilter, peerSourceOf } from './view-source'
import { FieldDiff } from './field-diff-view'
import { proposeInAgentSession } from './agent-runs'
import { viewingAgentRunId } from './agent-session'
import { copy, uiLanguage } from './i18n'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import { buildRowContextMenu } from './row-context-menu'
import { requestDeleteObjects } from './delete-objects'
import { StandardTableChrome } from './standard-table'
import { StandardEditableTable, type StandardColumn } from './standard-editable-table'
import { registerCommandRunner, runCommand } from './command-registry'
import { structureCaption } from './graph-scene'
import {
  displayViewTitle,
  emptyDetail,
  emptyGraph,
  isGenericObjectTitle,
  newObjectLabel,
  newObjectTitle,
  singularOf,
  typeNames,
  typeOfView,
  withIndefinite,
} from './type-labels'
import { publishProposal } from './proposal-bus'
import { ProposalBulkActions } from './proposal-actions'
import { acceptPendingLine, pendingLines, pendingRowsForObject, rejectPendingRow } from './proposal-focus'
import { ImportWorkspace } from './import/view'
import { rollbackTargetSeq } from './history-rollback'
import { StateNote } from './states'
import { classSections } from './class-sections'
import { LinkSections } from './link-section'
import { DetailMeta } from './detail-meta'
import { splitDetailKeys } from './detail-fields'
import { beginLinkDrag, dispatchLinkDrop, endLinkDrag, linkDragActive, linkDragContains, linkDragLabel, linkDragMime, linkDragObjects, linkDragPayload, linkDropDecision, readLinkDrag, setLinkDragHint } from './link-drag'
import { EMPTY_MANUAL_FILTER, groupKeyOf, isEmptyManualQuery, labelCodes, labelSearchFilter, publishSelectionLabels, SELECTION_APPLIED_EVENT, selectionFilterText, selectionMatchesType } from './assortment-filter'
import { appendPathFilter, objectTableFilter } from './table-filter'
import { dispatchUi, onUi } from './ui-bus'
import { columnMoveAppliesTo } from './column-move'
import {
  EMPTY_SELECTION,
  enrichSelection,
  publishActiveColumn,
  publishColumns,
  publishColumnPrefsOverride,
  publishSelection,
  publishTable,
  readMarkedSelection,
  readSelection,
  readTreeNode,
  subscribeUiSelections,
} from './ui-context'

export type PanesSession = {
  group: string | null
  objectId: string | null
  proposalId: string | null
  language: string
  listType?: string | null
  setListType?: (value: string | null) => void
  setGroup: (value: string | null) => void
  setObjectId: (value: string | null) => void
  setProposalId: (value: string | null) => void
  push: (line: string) => void
}

export type PanesView = {
  id: string
  type: string
  title: string
  pane?: string
  position?: number
  state: Json
}

export type PanesWorkspace = {
  id: string
  locked?: boolean
  catalog?: { catalogId?: string } | null
  /** Workspace views, used to type-filter a peer source's live selection. */
  views?: PanesView[] | null
}

type ObjRow = { id: string; key: string; type: string; version: string; name: string; status: string; doc: Json }

const columns = [
  { id: 'key', header: 'Number', size: 160, sort: 'a_number' },
  { id: 'name', header: 'Name', size: 280, sort: 'a_name__en' },
  { id: 'type', header: 'Type', size: 108, sort: 'type_key' },
  { id: 'status', header: 'Status', size: 128, sort: 'a_status' },
  { id: 'version', header: 'Version', size: 72, sort: 'version' },
]

const pageSize = 100

/** Prefs not applied yet: mutate against builtin chrome, not []. */
function orderBase(current: string[]) {
  return current.length > 0 ? current : columns.map((column) => column.id)
}

function savedTable(view: PanesView) {
  const table = (view.state.table as Json | undefined) ?? {}
  return {
    filter: String(table.filter ?? ''),
    sort: String(table.sort ?? 'a_number:asc'),
    groupBy: String(table.groupBy ?? ''),
    order: Array.isArray(table.order) ? table.order.map(String) : columns.map((column) => column.id),
    sizes: (table.sizes as Record<string, number> | undefined) ?? {},
  }
}

function objectRowId(id: string) {
  return `object-row-${id}`
}

function toRow(doc: Json, defs?: Json): ObjRow {
  return {
    id: String(doc.id ?? ''),
    key: String(doc.key ?? ''),
    type: String(doc.type_key ?? ''),
    version: String(doc.version ?? ''),
    name: catalogName(doc, defs),
    status: readIndexed(doc, defs, 'status'),
    doc,
  }
}

export function ObjectTable({
  session,
  view,
  workspace,
}: {
  session: PanesSession
  view: PanesView
  workspace: PanesWorkspace
}) {
  const initial = savedTable(view)
  const [filter, setFilter] = useState(initial.filter)
  const [selectionFilter, setSelectionFilter] = useState('')
  const [activeSelectionId, setActiveSelectionId] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [pathFilters, setPathFilters] = useState<string[]>([])
  const [exportPaths, setExportPaths] = useState<Array<{ id: string; header: string }>>([])
  const [picker, setPicker] = useState<null | 'filter' | 'export' | { text: string; label: string }>(null)
  const [pathValue, setPathValue] = useState('')
  const [queryText, setQueryText] = useState(initial.filter)
  const [sort, setSort] = useState(initial.sort)
  const [groupBy, setGroupBy] = useState(initial.groupBy)
  // Empty until prefs resolve — never flash builtin defaults over a saved layout.
  const [order, setOrder] = useState<string[]>([])
  const [sizes, setSizes] = useState<Record<string, number>>(initial.sizes)
  const [selected, setSelected] = useState<string[]>([])
  const [linkDropId, setLinkDropId] = useState<string | null>(null)
  useEffect(() => {
    const clear = () => setLinkDropId(null)
    window.addEventListener('braian-link-dragend', clear)
    return () => window.removeEventListener('braian-link-dragend', clear)
  }, [])
  const [hidden, setHidden] = useState<string[]>([])
  const [prefsReady, setPrefsReady] = useState(false)
  const [prefsLoadFailed, setPrefsLoadFailed] = useState(false)
  // Single focused row. Click and arrows move it; only Enter/Space/click commit
  // it as a selection, and Detail follows the selection, not this index.
  const [active, setActive] = useState(-1)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null)
  // The active cell's column, by key. Left and Right move it; the keyboard menu acts on it.
  const [activeColumn, setActiveColumn] = useState('')
  const [moving, setMoving] = useState<string | null>(null)
  const [massConfirm, setMassConfirm] = useState(false)
  const [flashId, setFlashId] = useState('')
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(null)
  const [editingDraft, setEditingDraft] = useState('')
  const editingOriginalRef = useRef('')
  const skipBlurCommitRef = useRef(false)
  const drafts = useSyncExternalStore(subscribeObjectDrafts, getObjectDraftSnapshot, getObjectDraftSnapshot)
  const draftSaving = useObjectDraftSaving()
  const openProposals = useOpenObjectProposals()
  const queryClient = useQueryClient()
  const parent = useRef<HTMLDivElement>(null)
  const prefsApplied = useRef(false)
  /** dataUpdatedAt we last applied; re-apply when invalidate lands a newer fetch. */
  const prefsAppliedAt = useRef(0)
  /** Definitions we last applied with; defaults change once the type is known. */
  const prefsAppliedDefs = useRef<unknown>(undefined)
  const prefsSnapshot = useRef<string | null>(null)
  const latestPrefsDocument = useRef<ColumnPrefsDocument | null>(null)
  const prefsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Unsaved local column-pref edits in this tab (shell.tsx dirtyRef pattern). */
  const prefsDirtyRef = useRef(false)
  const prefsSaveGen = useRef(0)
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/v1/me'), retry: false })
  const prefsMutation = useSaveColumnPrefs(view.id, me.data?.user_id ?? '')
  const flushPrefsRef = useRef<(opts?: { keepalive?: boolean }) => void>(() => undefined)
  flushPrefsRef.current = (opts) => {
    const document = latestPrefsDocument.current
    if (!document || document.columns.length === 0) return
    // Never replay a settled snapshot on tab hide — that overwrites other tabs.
    if (!prefsDirtyRef.current) return
    if (prefsSaveTimer.current != null) {
      clearTimeout(prefsSaveTimer.current)
      prefsSaveTimer.current = null
    }
    if (opts?.keepalive) {
      // Unload-safe sync PUT, dirty-gated like workspace layout flush in shell.tsx.
      // Do not clear dirty here (shell.tsx does not): a visibility flicker must not
      // look "clean" to onVisible while the keepalive/mutation is still in flight.
      saveColumnPrefsKeepalive(view.id, document)
      return
    }
    const gen = prefsSaveGen.current
    prefsMutation.mutate(
      { document },
      {
        onSuccess: () => {
          if (prefsSaveGen.current !== gen) return
          prefsDirtyRef.current = false
          // dataUpdatedAt latch in the apply effect re-applies after onSettled's
          // invalidate (isMutating === 1), including other tabs' writes.
        },
      },
    )
  }

  const virtualizerRef = useRef<{ scrollToIndex: (index: number) => void }>({ scrollToIndex: () => {} })
  const locateRef = useRef<(id: string) => number>(() => -1)
  const selectTries = useRef(0)
  useEffect(() => onFlash(setFlashId), [])

  useEffect(() => {
    const timer = setTimeout(() => setQueryText(filter), 120)
    return () => clearTimeout(timer)
  }, [filter])

  useEffect(() => {
    if (workspace.locked) return
    const timer = setTimeout(() => {
      const state = { ...view.state, table: { filter, sort, groupBy, sizes } }
      void api.post('/v1/views', { body: {
          id: view.id,
          workspace_id: workspace.id,
          type: view.type,
          title: view.title,
          pane: view.pane ?? 'center',
          position: view.position ?? 0,
          state,
        } }).catch((reason: unknown) => {
          reportWriteError(reason)
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [filter, sort, groupBy, sizes, view, workspace])

  const prefs = useQuery({
    queryKey: ['column-prefs', view.id],
    queryFn: () => fetchColumnPrefs(view.id),
    enabled: Boolean(view.id),
    retry: false,
    // Concurrent optimistic saves invalidate on settle; refetch after stale / focus.
    staleTime: 30_000,
  })
  const hasColumnOverride = columnPrefsHasOverride(prefs.data)

  const idToKey = useCatalogIdToKey()
  const catalogKey = catalogKeyOf(view.state, workspaceCatalogRef(workspace), idToKey)
  const catalogReady = catalogKey.length > 0
  const selectedOwners = useQuery({
    queryKey: ['object-origin', session.objectId],
    queryFn: async () => {
      const response = await fetch(`/v1/objects/${session.objectId}?include=owners,origin`, { credentials: 'include' })
      if (!response.ok) return { owners: {} as Record<string, string> }
      return response.json() as Promise<{ owners?: Record<string, string> }>
    },
    enabled: Boolean(session.objectId),
  })
  const ownersForRow = selectedOwners.data?.owners ?? {}
  const defs = useQuery({
    queryKey: ['definitions', catalogKey],
    queryFn: () => inCatalog(catalogKey, () => api.get('/v1/definitions')),
    enabled: catalogReady,
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const field = document.querySelector<HTMLInputElement>('.pane.focused [data-testid="quick-filter"]')
        ?? document.querySelector<HTMLInputElement>('[data-testid="quick-filter"]')
      if (!field) return
      event.preventDefault()
      field.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const names = typeNames(defs.data, uiLanguage)
  const bound = typeOfView(view, names) ?? (isGenericObjectTitle(view.title) ? names[0] : undefined)
  const typeKey = bound?.key ?? ''
  const assortments = useQuery({
    queryKey: ['assortments', typeKey],
    queryFn: () => api.get('/v1/assortments', { params: { query: { type: typeKey } } }),
    enabled: Boolean(typeKey),
  })
  const selectionRows = (assortments.data?.assortments ?? []).filter((item) =>
    selectionMatchesType(item, typeKey, bound?.id ?? ''),
  )
  useEffect(() => {
    if (!activeSelectionId || !assortments.isSuccess) return
    if (selectionRows.some((item) => String(item.id) === activeSelectionId)) return
    // The applied chip was deleted (or no longer belongs to this type): fall
    // back to All at once instead of leaving the table on the stale filter.
    setActiveSelectionId('')
    setFilter('')
    setQueryText('')
    setSelectionFilter('')
    session.setGroup(null)
    setLabelFilter('')
  }, [activeSelectionId, assortments.isSuccess, selectionRows, session])
  useEffect(() => {
    session.setListType?.(typeKey || null)
  }, [session, typeKey])
  useEffect(() => {
    const open = () => {
      if (session.objectId) setMoving(session.objectId)
    }
    window.addEventListener('braian-move-group', open)
    return () => window.removeEventListener('braian-move-group', open)
  }, [session.objectId])
  useEffect(() => {
    publishSelectionLabels(labelCodes(labelFilter.split(' && ').map((part) => part.replace(/^a_[A-Za-z0-9_]+:=/, ''))))
  }, [labelFilter])
  useEffect(() => {
    const onApply = (event: Event) => {
      const item = (event as CustomEvent<Json>).detail
      if (!item || !selectionMatchesType(item, typeKey, bound?.id ?? '')) return
      const query = (item.query as Json) ?? {}
      const dynamicFilter = selectionFilterText(query)
      const emptyManual = !dynamicFilter && isEmptyManualQuery(query)
      setActiveSelectionId(String(item.id ?? ''))
      setFilter('')
      setSelectionFilter(dynamicFilter || (emptyManual ? EMPTY_MANUAL_FILTER : ''))
      session.setGroup(dynamicFilter || emptyManual ? null : query.group ? String(query.group) : null)
      setLabelFilter(dynamicFilter || emptyManual ? '' : labelSearchFilter(query, defs.data))
    }
    window.addEventListener(SELECTION_APPLIED_EVENT, onApply)
    return () => window.removeEventListener(SELECTION_APPLIED_EVENT, onApply)
  }, [session, typeKey, bound?.id, defs.data])
  // A peer source replaces the global group filter: the view follows the other
  // view's row/node, not whatever group happens to be selected in the tree.
  const peerSource = peerSourceOf(view.state)
  const explicitAll = isExplicitAllSource(view.state)
  const peerSourceView = peerSource
    ? ((workspace.views as PanesView[] | null | undefined) ?? []).find((item) => item.id === peerSource.viewId)
    : undefined
  const peerSourceType = peerSourceView ? typeOfView(peerSourceView, names) : undefined
  const peerSourceTypeId = peerSourceType?.id ?? ''
  const peerSourceTypeKey = peerSourceType?.key ?? ''
  const livePeerRows = useSyncExternalStore(
    subscribeUiSelections,
    () => (peerSource ? readSelection(peerSource.viewId) : EMPTY_SELECTION),
    () => (peerSource ? readSelection(peerSource.viewId) : EMPTY_SELECTION),
  )
  // A table publishes the globally marked object as a fallback when it has no
  // active row. Keep only rows that really belong to the source view's type.
  const peerRows = useMemo(
    () => (!peerSourceTypeId && !peerSourceTypeKey
      ? livePeerRows
      : livePeerRows.filter((row) => !row.type || row.type === peerSourceTypeId || row.type === peerSourceTypeKey)),
    [livePeerRows, peerSourceTypeId, peerSourceTypeKey],
  )
  const peerNode = useSyncExternalStore(
    subscribeUiSelections,
    () => (peerSource?.selection === 'node' ? readTreeNode(peerSource.viewId) : null),
    () => (peerSource?.selection === 'node' ? readTreeNode(peerSource.viewId) : null),
  )
  const peerIds = useQuery({
    queryKey: [
      'peer-links',
      catalogKey,
      peerSource?.viewId ?? '',
      typeKey,
      peerSource?.linkType ?? '',
      peerRows.map((row) => row.id).join(','),
    ],
    queryFn: () => inCatalog(
      catalogKey,
      () => linkedPeerIds(peerRows.map((row) => row.id), typeKey, peerSource?.linkType),
    ),
    enabled: Boolean(catalogReady && typeKey && peerSource?.selection === 'row' && peerRows.length > 0),
    staleTime: 5_000,
  })
  const peerFilter = peerSource
    ? peerSource.selection === 'node'
      ? (peerNode ? peerNodeFilter(peerNode) : peerIdsFilter([]))
      : (peerIds.isSuccess ? peerIdsFilter(peerIds.data) : peerIdsFilter([]))
    : ''
  const filterBy = [objectTableFilter(typeKey, peerSource || explicitAll ? null : session.group, defs.data), peerFilter, selectionFilter, labelFilter, ...pathFilters]
    .filter(Boolean)
    .join(' && ')
  const attributePaths = useQuery({
    queryKey: ['attribute-paths', typeKey],
    queryFn: () =>
      api.get('/v1/types/{id}/attribute-paths', { params: { path: { id: typeKey } } }),
    enabled: Boolean(typeKey),
  })
  const systemColumns = attributePaths.data?.system_columns ?? []


  useEffect(() => {
    if (prefs.isPending || prefs.isFetching) return
    // Wait for system_columns when the type is known so injection uses the API allowlist.
    if (typeKey && attributePaths.isPending) return
    // Local edits and in-flight saves win over a refetch that landed mid-edit.
    if (prefsDirtyRef.current) return
    if (queryClient.isMutating({ mutationKey: columnPrefsMutationKey(view.id) }) > 0) return
    // Defaults for a type come from /v1/definitions (Brand is only there). Until
    // that GET lands, defaultColumnIdsForType falls back to builtin columns; wait
    // instead of latching those. Saved v2 prefs are usable without definitions.
    const saved = prefs.isSuccess ? prefs.data?.document : null
    const savedColumns = Array.isArray(saved?.columns) ? saved.columns : []
    const hasSavedPrefs = Number(saved?.version ?? 0) === 2 && savedColumns.length > 0
    const expectsType = Boolean(typeKey || view.state?.object_type || view.state?.type_key)
    const definitionsSettled = defs.data !== undefined || defs.isError || !catalogReady
    if (!hasSavedPrefs && expectsType && !definitionsSettled) return
    const updatedAt = prefs.dataUpdatedAt ?? 0
    // Same snapshot we already applied (unless onVisible/onSuccess cleared the latch).
    // Definitions are part of the key: defaults must be recomputed when the type
    // becomes known, without touching a saved prefs document.
    if (
      prefsApplied.current
      && prefsAppliedAt.current === updatedAt
      && prefsAppliedDefs.current === defs.data
    ) return
    prefsApplied.current = true
    prefsAppliedAt.current = updatedAt
    prefsAppliedDefs.current = defs.data
    const seedDefaults = () => {
      // Same defaults as an empty prefs document (never flash before prefsReady).
      const viewOrder = (view.state as { table?: { order?: unknown } } | undefined)?.table?.order
      if (Array.isArray(viewOrder)) {
        const orderIds = viewOrder.map(String)
        const ensured = ensureSystemColumns(orderIds, [], systemColumns)
        setOrder((current) => (current.length > 0 ? current : ensured.order))
        setHidden((current) => (current.length > 0 ? current : ensured.hidden))
        prefsSnapshot.current = JSON.stringify([ensured.order, ensured.hidden])
      } else if (typeKey) {
        const defaults = defaultColumnIdsForType(typeKey, defs.data)
        const ensured = ensureSystemColumns(defaults, [], systemColumns)
        setOrder((current) => (current.length > 0 ? current : ensured.order))
        setHidden((current) => (current.length > 0 ? current : ensured.hidden))
        prefsSnapshot.current = JSON.stringify([ensured.order, ensured.hidden])
      } else {
        // Harness / untitled view: seed builtin chrome once (never clobber a local move).
        const builtinIds = columns.map((column) => column.id)
        setOrder((current) => (current.length > 0 ? current : builtinIds))
        setHidden((current) => (current.length > 0 ? current : []))
        prefsSnapshot.current = JSON.stringify([builtinIds, []])
      }
    }
    const applied =
      prefs.isSuccess
        ? prefsToOrderHidden(prefs.data, systemColumns, typeKey, defs.data)
        : null
    if (applied) {
      setPrefsLoadFailed(false)
      setOrder(applied.order)
      setHidden(applied.hidden)
      // Align baseline so this apply does not schedule a PUT.
      prefsSnapshot.current = JSON.stringify([applied.order, applied.hidden])
    } else if (prefs.isSuccess && !prefs.data?.document) {
      // No saved prefs row: defaults only after load (never as a flash).
      setPrefsLoadFailed(false)
      seedDefaults()
    } else if (prefs.isError) {
      // Failed GET: seed defaults so Fields › / drag mutate a real order, not [].
      setPrefsLoadFailed(true)
      seedDefaults()
    }
    setPrefsReady(true)
  }, [prefs.isPending, prefs.isFetching, prefs.isSuccess, prefs.isError, prefs.data, prefs.dataUpdatedAt, typeKey, attributePaths.isPending, systemColumns, defs.data, defs.isError, catalogReady, view.state, view.id, queryClient])

  // Other tabs' saves: when this tab becomes visible again and is clean, drop the
  // one-shot latch and invalidate so React Query refetches and apply can run.
  // Do not listen to window focus — that fires on ordinary clicks and races saves.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      // Hidden before the mutate timer: only keepalive ran and dirty stayed true, so
      // we would never sync other tabs. Finish via TanStack mutate (clears dirty on
      // success; onSettled still invalidates when isMutating === 1).
      if (prefsDirtyRef.current) {
        flushPrefsRef.current()
        return
      }
      if (queryClient.isMutating({ mutationKey: columnPrefsMutationKey(view.id) }) > 0) return
      prefsApplied.current = false
      void queryClient.invalidateQueries({ queryKey: columnPrefsQueryKey(view.id) })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [queryClient, view.id])
  useLayoutEffect(() => {
    if (!prefsReady) return
    const snapshot = JSON.stringify([order, hidden])
    // The first run after the GET is the baseline: never PUT the load itself.
    if (prefsSnapshot.current === null) {
      prefsSnapshot.current = snapshot
      return
    }
    if (prefsSnapshot.current === snapshot) return
    const document = orderHiddenToDocument(
      order,
      hidden,
      attributePaths.data?.paths.map((path) => path.text),
      systemColumns,
    )
    if (document.columns.length === 0) return
    latestPrefsDocument.current = document
    prefsDirtyRef.current = true
    prefsSaveGen.current += 1
    prefsSnapshot.current = snapshot
    if (prefsSaveTimer.current != null) clearTimeout(prefsSaveTimer.current)
    prefsSaveTimer.current = setTimeout(() => {
      prefsSaveTimer.current = null
      flushPrefsRef.current()
    }, 0)
    return () => {
      if (prefsSaveTimer.current != null) {
        clearTimeout(prefsSaveTimer.current)
        prefsSaveTimer.current = null
      }
      // Leaving the effect (nav away / unmount / superseded edit): flush.
      flushPrefsRef.current()
    }
  }, [order, hidden, prefsReady, attributePaths.data, systemColumns, view.id])
  useEffect(() => {
    const flush = () => flushPrefsRef.current({ keepalive: true })
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [])
  const sortBy = indexSort(sort, defs.data)
  const groupField = groupBy ? indexSort(groupBy, defs.data) : groupBy
  const probe = useQuery({
    queryKey: ['objects', catalogKey, queryText, filterBy, sortBy, groupField, 1],
    queryFn: () => inCatalog(catalogKey, () => loadPage(queryText, filterBy, sortBy, groupField, 1)),
    enabled: catalogReady,
    placeholderData: (previous) => previous,
  })
  const found = Number(probe.data?.found ?? 0)
  const virtualizer = useVirtualizer({
    count: groupBy ? 0 : found,
    getScrollElement: () => parent.current,
    estimateSize: () => 28,
    overscan: 16,
  })
  const visible = virtualizer.getVirtualItems()
  const start = visible[0]?.index ?? 0
  const end = visible.at(-1)?.index ?? start
  const pages = groupBy ? [] : [...new Set([Math.floor(start / pageSize) + 1, Math.floor(end / pageSize) + 1])]
  const windows = useQueries({
    queries: pages.map((page) => ({
      queryKey: ['objects', catalogKey, queryText, filterBy, sortBy, groupField, page],
      queryFn: () => inCatalog(catalogKey, () => loadPage(queryText, filterBy, sortBy, groupField, page)),
      enabled: catalogReady,
      placeholderData: (previous: Awaited<ReturnType<typeof loadPage>> | undefined) => previous,
    })),
  })
  const byIndex = new Map<number, ObjRow>()
  const rowsRef = useRef(byIndex)
  for (const result of windows) {
    const page = Number(result.data?.page ?? 0)
    const hits = (result.data?.hits as Json[] | undefined) ?? []
    hits.forEach((hit, offset) => {
      const doc = (hit.document as Json) ?? hit
      byIndex.set((page - 1) * pageSize + offset, toRow(doc, defs.data))
    })
  }
  const groups = ((probe.data?.groups as Json[] | undefined) ?? []).map((group) => ({
    key: String(group.key ?? ''),
    found: Number(group.found ?? 0),
    hits: ((group.hits as Json[]) ?? []).map((hit) => toRow((hit.document as Json) ?? hit, defs.data)),
  }))
  const groupedRows = groups.flatMap((group) => group.hits)
  // A peer source with nothing to follow shows an empty state, never every row.
  const peerSelectionLabel = peerSource?.selection === 'node'
    ? (peerNode ? structureCaption(peerNode.groupKey, defs.data, peerNode.structureKey) || peerNode.groupKey : '')
    : peerRows.map((row) => row.key || row.name || row.id).filter(Boolean).slice(0, 3).join(', ')
  const peerHasSelection = peerSource?.selection === 'node' ? Boolean(peerNode) : peerRows.length > 0
  const peerLinkedCount = peerSource?.selection === 'node'
    ? (probe.isSuccess && !probe.isFetching ? found : null)
    : (peerIds.isSuccess ? peerIds.data.length : null)
  const peerEmpty = peerEmptyState({
    source: peerSource,
    sourceView: peerSourceView,
    targetType: bound,
    hasSelection: peerHasSelection,
    selectionLabel: peerSelectionLabel,
    linkedCount: peerLinkedCount,
  })
  const listCount = groupBy ? groupedRows.length : found
  const rowAt = (index: number) => (groupBy ? groupedRows[index] : byIndex.get(index))
  const activeRow = active >= 0 ? rowAt(active) : undefined
  virtualizerRef.current = virtualizer
  locateRef.current = (id: string) => {
    if (groupBy) return groupedRows.findIndex((row) => row.id === id)
    for (const [index, row] of byIndex) if (row.id === id) return index
    return -1
  }

  rowsRef.current = byIndex
  const knownStamp = [...byIndex.values()].map((row) => `${row.id}:${row.key}:${row.name}:${row.type}`).join('|')
  const [selectTick, setSelectTick] = useState(0)
  // Search is a few seconds behind the write. Keep asking until the new row is on the page.
  useEffect(() => {
    if (!pendingSelectId) {
      selectTries.current = 0
      return
    }
    const index = locateRef.current(pendingSelectId)
    if (index >= 0) {
      setActive(index)
      setSelected([pendingSelectId])
      session.setObjectId(pendingSelectId)
      setPendingSelectId(null)
      virtualizerRef.current.scrollToIndex(index)
      return
    }
    if (selectTries.current >= 40) return
    const timer = setTimeout(() => {
      selectTries.current += 1
      void queryClient.invalidateQueries({ queryKey: ['objects'] })
      setSelectTick((tick) => tick + 1)
    }, 500)
    return () => clearTimeout(timer)
  }, [pendingSelectId, knownStamp, selectTick, session, queryClient])
  // Rows picked under an old peer filter are out of scope once the source
  // changes. Do not publish them, and drop the local pick so the table cannot
  // keep an invisible selection.
  const peerScope = peerSource
    ? `${peerSource.viewId}:${peerSource.selection}:${peerSource.linkType ?? ''}:${peerFilter}`
    : ''
  const peerScopeRef = useRef(peerScope)
  // Reload restores the open object from the URL, but a fresh table starts with
  // no row selection, so a peer view that follows it would show its empty state.
  // Adopt the marked object once it belongs to this table's type and the user
  // has not picked a row here. A peer-sourced table never adopts it: its
  // selection is its own row, not the object open in detail.
  const markedSelection = readMarkedSelection()
  const markedForTable = Boolean(
    markedSelection
    && markedSelection.id
    && markedSelection.type
    && bound
    && (markedSelection.type === bound.id || markedSelection.type === bound.key),
  )
  useEffect(() => {
    if (peerSource) return
    if (selected.length > 0) return
    if (!markedForTable || !markedSelection) return
    setSelected([markedSelection.id])
    setActive(locateRef.current(markedSelection.id))
  }, [markedForTable, markedSelection, peerSource, selected])
  useEffect(() => {
    const scopeChanged = peerScopeRef.current !== peerScope
    peerScopeRef.current = peerScope
    if (scopeChanged) {
      setSelected([])
      setActive(-1)
    }
    const known = [...rowsRef.current.values()]
    const described = (id: string) => {
      const row = known.find((item) => item.id === id)
      return row
        ? { id: row.id, key: row.key, name: row.name, type: row.type, version: row.version }
        : { id, key: '', name: '', type: '', version: '' }
    }
    // Publish the rows the user actually selected. Keyboard focus alone is not
    // a selection; Detail and peer panes follow `selected`, never `activeRow`.
    const marked = scopeChanged ? [] : selected.map(described)
    publishTable(view.id, [queryText, filterBy].filter(Boolean).join(' '), sort, filterBy)
    publishSelection(view.id, marked)
  }, [peerScope, selected, queryText, filterBy, sort, view.id, knownStamp])

  const pathList = attributePaths.data?.paths ?? []
  const columnFor = (id: string) => {
    const sort = sortKeyForColumnId(id, defs.data)
    const builtin = columns.find((column) => column.id === id)
    if (builtin) return { ...builtin, sort: sort || builtin.sort }
    // Prefs use `number`; the legacy builtin id is `key`.
    if (id === 'number' || parseColumnId(id).path === 'number') {
      return { id, header: 'Number', size: 160, sort: sort || 'a_number' }
    }
    const { path, qualifiers } = parseColumnId(id)
    const pathLabel =
      systemColumns.find((column) => column.key === id || column.key === path)?.label
      ?? pathList.find((item) => item.text === path)?.label
      ?? path
    // Prefer qualifier-aware title when we can rebuild the column from the catalog.
    const catalog = fieldCatalogForType(defs.data ?? {}, typeKey)
    const fieldPath = fieldPathForPath(path, catalog)
    const rebuilt = makeViewColumn(fieldPath, qualifiers, catalog)
    const header = rebuilt ? columnTitle(rebuilt) : pathLabel
    const wide = path.includes('>') || qualifiers.length > 0
    return { id, header, size: wide ? 260 : 160, sort }
  }
  const columnDefs = [
    ...columns,
    ...pathList
      .filter((path) => !columns.some((column) => column.id === path.text))
      .map((path) => ({ id: path.text, header: path.label, size: 160, sort: '' })),
  ]
  const ordered = order.filter(Boolean)
  // Before prefsReady, render no real columns (skeleton instead). After load, empty
  // order means defaults were applied in the prefs effect — still never flash builtins early.
  const all = !prefsReady ? [] : ordered.length > 0 ? ordered : columns.map((column) => column.id)
  const shown = all.filter((id) => !hidden.includes(id))
  const cellColumn = shown.includes(activeColumn) ? activeColumn : shown[0] ?? ''
  const columnHeader = (id: string) => columnFor(id).header
  const columnStamp = all.map((id) => `${id}:${hidden.includes(id) ? 1 : 0}`).join('|')
  useEffect(() => {
    publishColumns(view.id, all.map((id) => ({ id, header: columnHeader(id), hidden: hidden.includes(id) })))
  }, [columnStamp, view.id])
  useEffect(() => {
    publishColumnPrefsOverride(view.id, hasColumnOverride)
  }, [view.id, hasColumnOverride])
  // Record every activation directly, in the event that caused it. Publishing
  // from a passive effect here would land after the next pane's header click
  // when a body click and a Detail open commit later, and the stale publish
  // would steal the keyboard move target from the header the user clicked last.
  const activateColumn = (column: string) => {
    setActiveColumn(column)
    publishActiveColumn(view.id, column)
  }
  const exportVisible = () => {
    const body = exportPayload({
      columns: columnDefs,
      hidden,
      order,
      q: queryText,
      filter: filterBy,
      sort,
      ids: selected,
      lang: session.language,
    })
    const known = new Set(body.columns.map((column) => column.id))
    for (const column of exportPaths) {
      if (!known.has(column.id)) body.columns.push(column)
    }
    session.push(copy.exportStarted)
    void runExport(body)
      .then((blob) => {
        saveWorkbook(blob)
        session.push(copy.exportReady)
      })
      .catch((error: unknown) => {
        reportWriteError(error)
      })
  }
  const mass = useMutation({
    mutationFn: () =>
      api.post('/v1/operations/{name}', {
        params: { path: { name: 'mass_edit' } },
        body: {
          title: 'Status OK',
          ids: selected,
          type: [...byIndex.values()].find((row) => selected.includes(row.id))?.type ?? 'article',
          values: { status: 'ok' },
        },
      }),
    onSuccess: (result) => {
      const id = String(jsonRecord(result)?.id ?? '')
      session.setProposalId(id)
      session.push(`${copy.proposals} ${id}`)
    },
    onError: (reason: unknown) => {
      reportWriteError(reason)
    },
  })

  /**
   * Reset to the type default: drop the personal prefs row and paint defaults
   * optimistically. The snapshot is aligned first so the diff effect does not
   * save a lookalike default document on the way out.
   */
  const resetColumnsToDefault = () => {
    const viewOrder = (view.state as { table?: { order?: unknown } } | undefined)?.table?.order
    const defaults = typeKey
      ? defaultColumnIdsForType(typeKey, defs.data)
      : Array.isArray(viewOrder)
        ? viewOrder.map(String)
        : columns.map((column) => column.id)
    const ensured = ensureSystemColumns(defaults, [], systemColumns)
    if (prefsSaveTimer.current != null) {
      clearTimeout(prefsSaveTimer.current)
      prefsSaveTimer.current = null
    }
    prefsDirtyRef.current = false
    latestPrefsDocument.current = null
    prefsSnapshot.current = JSON.stringify([ensured.order, ensured.hidden])
    setOrder(ensured.order)
    setHidden(ensured.hidden)
    void resetColumnPrefs(queryClient, view.id).catch((reason: unknown) => {
      reportWriteError(reason)
    })
  }

  useEffect(() => onUi((event) => {
    const args = event.args
    if (event.name === 'ui.reset_columns') {
      const target = String(args.view ?? args.view_id ?? '')
      if (target && target !== view.id) return
      resetColumnsToDefault()
      return
    }
    if (event.name === 'ui.filter') setFilter(String(args.q ?? args.text ?? args.filter ?? ''))
    if (event.name === 'ui.group') setGroupBy(String(args.group ?? args.by ?? ''))
    if (event.name === 'ui.sort' && args.sort) setSort(String(args.sort))
    if (event.name === 'ui.select' && args.id) {
      const id = String(args.id)
      session.setObjectId(id)
      setSelected([id])
      const index = locateRef.current(id)
      if (index >= 0) setActive(index)
    }
    if (event.name === 'ui.select_rows' && Array.isArray(args.ids)) setSelected(args.ids.map(String))
    if (event.name === 'ui.show_column') {
      const column = String(args.column ?? args.id ?? '')
      // A re-shown column must land last (same rule as Fields toggleField).
      setOrder((current) => [...orderBase(current).filter((id) => id !== column), column])
      setHidden((current) => current.filter((id) => id !== column))
    }
    if (event.name === 'ui.hide_column') setHidden((current) => [...new Set([...current, String(args.column ?? args.id ?? '')])])
    if (event.name === 'ui.move_column') {
      if (!columnMoveAppliesTo(args, view.id)) return
      const from = String(args.from ?? args.column ?? '')
      if (!from) return
      const direction = String(args.direction ?? '')
      if (direction === 'left' || direction === 'right') {
        const delta = direction === 'left' ? -1 : 1
        setOrder((current) => {
          const next = [...orderBase(current)]
          if (!next.includes(from)) next.push(from)
          const at = next.indexOf(from)
          const to = Math.min(next.length - 1, Math.max(0, at + delta))
          if (at === to) return next
          next.splice(at, 1)
          next.splice(to, 0, from)
          return next
        })
        return
      }
      const to = String(args.to ?? '')
      setOrder((current) => {
        const next = orderBase(current).filter((item) => item !== from)
        const at = to ? next.indexOf(to) : next.length
        next.splice(at < 0 ? next.length : at, 0, from)
        return next
      })
    }
    if (event.name === 'ui.export') exportVisible()
  }), [exportPaths, filterBy, hidden, order, queryText, resetColumnsToDefault, selected, session, sort])
  useEffect(() => {
    const onFilter = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; label?: string }>).detail
      if (detail?.text) {
        setPathValue('')
        setPicker({ text: detail.text, label: detail.label || detail.text })
      } else {
        setPicker('filter')
      }
    }
    const onExport = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; label?: string }>).detail
      if (detail?.text) {
        const text = detail.text
        const label = detail.label || text
        setExportPaths((current) => current.some((item) => item.id === text) ? current : [...current, { id: text, header: label }])
      } else {
        setPicker('export')
      }
    }
    window.addEventListener('braian-path-filter', onFilter)
    window.addEventListener('braian-export-column', onExport)
    return () => {
      window.removeEventListener('braian-path-filter', onFilter)
      window.removeEventListener('braian-export-column', onExport)
    }
  }, [])

  const applySelection = (row: ObjRow, index: number, anchor: number, extend: boolean) => {
    session.setObjectId(row.id)
    if (!extend) {
      setSelected([row.id])
      return
    }
    const [start, end] = anchor < index ? [anchor, index] : [index, Math.max(anchor, 0)]
    const ids: string[] = []
    for (let cursor = start; cursor <= end; cursor += 1) {
      const item = rowAt(cursor)
      if (item) ids.push(item.id)
    }
    setSelected(ids.length > 0 ? ids : [row.id])
  }

  // Keep the focused row in view. A virtualized row may mount a frame later;
  // scrolling active is independent of committing a selection.
  useEffect(() => {
    if (active < 0) return
    if (groupBy) {
      const row = rowAt(active)
      if (row) document.getElementById(objectRowId(row.id))?.scrollIntoView({ block: 'nearest' })
    } else {
      virtualizerRef.current.scrollToIndex(active)
    }
  }, [active, groupBy])

  const moveActive = (next: number, extend: boolean) => {
    if (listCount <= 0) return
    const clamped = Math.max(0, Math.min(listCount - 1, next))
    setActive(clamped)
    const row = rowAt(clamped)
    if (!row) return
    // Shift+Arrow is an explicit range extension, so it also commits a selection.
    // Plain navigation only moves focus and must not touch Detail or peer panes.
    if (extend) applySelection(row, clamped, active, extend)
  }

  const focusGrid = () => {
    const node = parent.current
    if (!node || document.activeElement === node) return
    node.focus({ preventScroll: true })
  }

  const endpointOf = (row: ObjRow) => ({ id: row.id, typeKey: row.type, name: row.name, key: row.key })
  const onLinkDragStart = (row: ObjRow, event: ReactDragEvent<HTMLDivElement>) => {
    const known = (groupBy ? groupedRows : [...byIndex.values()]).map(endpointOf)
    const objects = linkDragObjects(endpointOf(row), selected, known)
    beginLinkDrag(event.nativeEvent, objects, linkDragLabel(objects, defs.data))
  }
  const onLinkDragOver = (row: ObjRow, event: ReactDragEvent<HTMLDivElement>) => {
    if (!linkDragActive(event.dataTransfer.types)) return
    if (linkDragContains(row.id)) return
    const dragged = linkDragPayload()
    const decision = linkDropDecision({
      loading: defs.isLoading,
      defs: defs.data,
      anchorType: row.type,
      draggedTypes: dragged.map((item) => item.typeKey),
    })
    event.preventDefault()
    if (!decision.accept) {
      event.dataTransfer.dropEffect = 'none'
      setLinkDropId(null)
      setLinkDragHint(decision.hint)
      return
    }
    setLinkDragHint(null)
    event.dataTransfer.dropEffect = 'copy'
    setLinkDropId(row.id)
  }
  const onLinkDragLeave = (row: ObjRow) => {
    setLinkDropId((current) => (current === row.id ? null : current))
  }
  const onLinkDrop = (row: ObjRow, event: ReactDragEvent<HTMLDivElement>) => {
    if (!linkDragActive(event.dataTransfer.types)) return
    event.preventDefault()
    setLinkDropId(null)
    const dragged = linkDragPayload()
    const decision = linkDropDecision({
      loading: defs.isLoading,
      defs: defs.data,
      anchorType: row.type,
      draggedTypes: dragged.map((item) => item.typeKey),
    })
    if (!decision.accept) {
      endLinkDrag()
      return
    }
    const targets = readLinkDrag(event.dataTransfer.getData(linkDragMime)).filter((item) => item.id !== row.id)
    endLinkDrag()
    if (targets.length === 0) return
    dispatchLinkDrop({ source: endpointOf(row), targets })
  }

  const onRowClick = (index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    focusGrid()
    setActive(index)
    const row = rowAt(index)
    if (!row) return
    session.setObjectId(row.id)
    if (event.shiftKey) setSelected((current) => (current.includes(row.id) ? current : [...current, row.id]))
    else if (event.metaKey || event.ctrlKey) {
      setSelected((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]))
    } else setSelected([row.id])
  }

  const onRowMenu = (index: number, x: number, y: number, column: string) => {
    setActive(index)
    if (column) activateColumn(column)
    const row = rowAt(index)
    if (!row) return
    session.setObjectId(row.id)
    setSelected((current) => (current.includes(row.id) ? current : [row.id]))
    const context = column ? 'cell' : 'row'
    const hiddenColumns = all
      .filter((id) => hidden.includes(id))
      .map((id) => ({ id, header: columnHeader(id) }))
    const chosen = selected.includes(row.id) ? selected : [row.id]
    const known = new Map((groupBy ? groupedRows : [...byIndex.values()]).map((item) => [item.id, endpointOf(item)]))
    const menu = buildRowContextMenu({
      context,
      defs: defs.data,
      rowType: row.type || session.listType || '',
      language: uiLanguage,
      target: {
        objectId: row.id,
        column: column || undefined,
        columnHeader: column ? columnHeader(column) : undefined,
        hiddenColumns,
        typeKey: session.listType ?? undefined,
        viewId: view.id,
        columnPrefsOverride: hasColumnOverride,
        objects: chosen.flatMap((id) => {
          const item = known.get(id)
          return item ? [item] : []
        }),
      },
      selectedCount: chosen.length,
    })
    openSharedContextMenu({
      context,
      x,
      y,
      target: menu.target,
      extra: menu.items,
      extraOnly: true,
    })
  }

  const onHeaderMenu = (column: string, event: ReactMouseEvent<HTMLElement>) => {
    if (prefersNativeContextMenu(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    activateColumn(column)
    const row = active < 0 ? undefined : rowAt(active)
    const box = event.currentTarget.getBoundingClientRect()
    // A pointer right-click carries button 2; the ContextMenu key opens this event without one.
    const byPointer = event.button === 2
    openSharedContextMenu({
      context: 'table-header',
      x: byPointer ? event.clientX : box.left,
      y: byPointer ? event.clientY : box.bottom,
      target: {
        objectId: row?.id,
        column,
        columnHeader: columnHeader(column),
        typeKey: session.listType ?? undefined,
        singular: session.listType ? singularOf(defs.data, session.listType, uiLanguage) || undefined : undefined,
        viewId: view.id,
        columnPrefsOverride: hasColumnOverride,
      },
    })
  }

  // Shift+F10 or the ContextMenu key: the same menu, placed under the active cell or the focused header.
  const openMenuFromKeyboard = (target?: EventTarget | null) => {
    const focused = target instanceof Element ? target : document.activeElement
    const header = focused instanceof Element ? focused.closest('[data-testid^="col-"]') : null
    const headerColumn = header?.getAttribute('data-column') ?? ''
    if (header && headerColumn) {
      const row = active < 0 ? undefined : rowAt(active)
      const box = header.getBoundingClientRect()
      activateColumn(headerColumn)
      openSharedContextMenu({
        context: 'table-header',
        x: box.left,
        y: box.bottom,
        target: {
          objectId: row?.id,
          column: headerColumn,
          columnHeader: columnHeader(headerColumn),
          typeKey: session.listType ?? undefined,
          singular: session.listType ? singularOf(defs.data, session.listType, uiLanguage) || undefined : undefined,
          viewId: view.id,
          columnPrefsOverride: hasColumnOverride,
        },
      })
      return
    }
    const index = active < 0 ? 0 : active
    const row = rowAt(index)
    if (!row) return
    const cellNode = document.getElementById(objectRowId(row.id))?.querySelector(`[data-column="${cellColumn}"]`)
    const box = cellNode?.getBoundingClientRect()
    onRowMenu(index, box ? box.left : 0, box ? box.bottom : 0, cellColumn)
  }


  useEffect(() => {
    const stops = [
      registerCommandRunner('object:open', (target) => {
        if (!target.objectId) return
        const id = String(target.objectId)
        const index = locateRef.current(id)
        if (index >= 0) {
          setActive(index)
          setSelected([id])
        }
        session.setObjectId(id)
      }),
      registerCommandRunner('object:right', () => {
        dispatchUi('ui.place', { title: 'Detail', zone: 'right' })
      }),
      registerCommandRunner('object:history', () => {
        dispatchUi('ui.open_view', { title: 'History' })
      }),
      registerCommandRunner('object:move-group', (target) => {
        if (target.objectId) setMoving(String(target.objectId))
      }),
      registerCommandRunner('table:select', (target) => {
        if (!target.objectId) return
        setSelected((current) => current.includes(String(target.objectId)) ? current : [...current, String(target.objectId)])
      }),
      registerCommandRunner('table:mass-edit', () => { setMassConfirm(true) }),
      registerCommandRunner('table:filter-by', () => setPicker('filter')),
      registerCommandRunner('table:export-columns', () => setPicker('export')),
      registerCommandRunner('table:export', () => { exportVisible() }),
      registerCommandRunner('fields:select', () => {
        window.dispatchEvent(new CustomEvent('braian-fields-palette', { detail: {} }))
      }),
      registerCommandRunner('fields:edit', (target) => {
        const columnId = target?.column ?? ''
        window.dispatchEvent(new CustomEvent('braian-fields-palette', { detail: { editColumnId: columnId || null } }))
      }),
      registerCommandRunner('object:new', () => {
        if (document.querySelector('[data-testid="command-palette"], [data-testid="fields-mode"]')) return
        setCreateOpen(true)
      }),
      registerCommandRunner('link:selected', (target) => {
        const objects = Array.isArray(target.objects) ? target.objects.filter((item) => item && typeof item === 'object' && 'id' in item && 'typeKey' in item) : []
        if (objects.length < 2) return
        window.dispatchEvent(new CustomEvent('braian-link-pick', { detail: { objects } }))
      }),
    ]
    return () => stops.forEach((stop) => stop())
  })


  useEffect(() => {
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; target?: { objectId?: string } }>).detail
      if (!detail?.id?.startsWith('link:add:')) return
      const [linkType, direction] = detail.id.slice('link:add:'.length).split(':')
      if (detail.target?.objectId) session.setObjectId(String(detail.target.objectId))
      window.dispatchEvent(new CustomEvent('braian-add-link', { detail: { linkType, direction } }))
    }
    window.addEventListener('braian:command', onCommand)
    return () => window.removeEventListener('braian:command', onCommand)
  }, [session])

  const onTableKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // While a cell editor is open, leave every key to the input (caret / selection / typing).
    if (isEditingCell(event, editingCell)) return
    if (event.key === 'Delete' && !event.ctrlKey && !event.altKey && !event.metaKey && selected.length > 0) {
      event.preventDefault()
      requestDeleteObjects(selected)
      return
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      event.preventDefault()
      openMenuFromKeyboard(event.target)
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const at = shown.indexOf(cellColumn)
      const next = shown[Math.max(0, Math.min(shown.length - 1, at + (event.key === 'ArrowRight' ? 1 : -1)))]
      if (next) activateColumn(next)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) return
    if (event.key === 'Escape') {
      return
    }
    event.preventDefault()
    if (event.key === 'Enter' || event.key === ' ') {
      // Enter and Space commit the focused row as the selection. Focus alone
      // (arrows, Home/End, Tab) never selects.
      const row = rowAt(active)
      if (row) applySelection(row, active, active, false)
      return
    }
    const next = event.key === 'ArrowDown'
      ? active + 1
      : event.key === 'ArrowUp'
        ? active - 1
        : event.key === 'PageDown'
          ? active + 10
          : event.key === 'PageUp'
            ? active - 10
            : event.key === 'Home'
              ? 0
              : listCount - 1
    moveActive(next, event.shiftKey)
  }

  const suggestions = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.get('/v1/proposals'),
  })
  const suggestionCounts = suggestionIndex(suggestions.data)
  /** Columns that Typesense hits do not carry (hops, units, searchable-only / language text). */
  const columnNeedsPathValues = (id: string) => {
    if (isHopPath(id)) return true
    const { path, qualifiers } = parseColumnId(id)
    if (qualifiers.some((q) => q.kind === 'unit' || q.kind === 'cardinality')) return true
    if (path.includes('@')) return true
    const key = (path.split('.')[0] ?? path).split('@')[0] ?? path
    if (key === 'number' || key === 'name' || key === 'key' || key === 'type' || key === 'version' || key === 'status') {
      return false
    }
    const attr = attributeByKey(defs.data, key)
    if (!attr) return false
    if (attr.language_dependent) return true
    const index = attr.index as { filterable?: boolean; sortable?: boolean } | undefined
    // Searchable-only fields live in search_{lang}, not a_<id> — grid must use pathValues.
    if (index && !index.filterable && !index.sortable) return true
    return false
  }
  const pathValueColumns = shown.filter(columnNeedsPathValues)
  // When Status/Type grouping is on, rows live in groupedRows — byIndex stays empty.
  const pageRowIds = (groupBy ? groupedRows : Array.from(byIndex.values())).map((row) => row.id)
  const pathValues = useQuery({
    queryKey: ['path-values', catalogKey, typeKey, pathValueColumns, pageRowIds],
    queryFn: () => inCatalog(catalogKey, () => fetchPathValues({ ids: pageRowIds, paths: pathValueColumns, typeKey })),
    enabled: catalogReady && pathValueColumns.length > 0 && pageRowIds.length > 0 && Boolean(typeKey),
    // Keep the last page of hop/localized cells while a live refresh refetches,
    // so Description and Version can swap together instead of flashing '—'.
    placeholderData: (previous) => previous,
  })
  const pathValuesPending =
    pathValueColumns.length > 0 &&
    !pathValues.data &&
    (pathValues.isPending || pathValues.isFetching)
  const objectsFetching = probe.isFetching || windows.some((result) => result.isFetching)
  const pathBusy = pathValueColumns.length > 0 && pathValues.isFetching
  // Hold Typesense hits and pathValues until both refreshes settle so a live
  // edit does not paint Description a frame before Version (or the reverse).
  const tableBusy = shouldHoldTablePaint({
    hasPaintedData: Boolean(pathValues.data) || byIndex.size > 0,
    objectsFetching,
    pathBusy,
  })
  const stableTableRef = useRef<{
    pathValues: typeof pathValues.data
    byIndex: Map<number, ObjRow>
    groupedRows: ObjRow[]
  } | null>(null)
  const held = stableTableRef.current
  const liveRowCount = byIndex.size + groupedRows.length
  const heldRowCount = held ? held.byIndex.size + held.groupedRows.length : 0
  if (
    shouldRefreshTableSnapshot({
      tableBusy,
      hasSnapshot: held != null,
      heldRowCount,
      liveRowCount,
    })
  ) {
    stableTableRef.current = {
      pathValues: pathValues.data,
      byIndex: new Map(byIndex),
      groupedRows: [...groupedRows],
    }
  }
  const painted = stableTableRef.current ?? {
    pathValues: pathValues.data,
    byIndex,
    groupedRows,
  }
  const paintPathValues = tableBusy ? painted.pathValues : pathValues.data
  const rowAtPainted = (index: number) =>
    groupBy ? painted.groupedRows[index] : painted.byIndex.get(index)
  const cellDisplayText = (row: ObjRow, id: string) => {
    const apiPath = parseColumnId(id).path
    if (columnNeedsPathValues(id)) {
      const values = cellPathValues(paintPathValues?.values?.[row.id], id)
      return summarizePathValues(values).text
    }
    return readPathFromDoc(row.doc, defs.data, apiPath)
  }

  const commitCellEdit = (row: ObjRow, columnId: string, nextText: string) => {
    // Prevent the input's blur (fired on unmount after Enter) from double-PATCHing.
    skipBlurCommitRef.current = true
    setEditingCell(null)
    const original = editingOriginalRef.current
    if (!cellEditShouldPatch(original, nextText)) return
    const path = parseColumnId(columnId).path
    const langMatch = path.includes('@') ? path.split('@') : null
    const attrKey = (langMatch ? langMatch[0]! : path).split('.')[0] ?? path
    const language = langMatch?.[1]
    const attr = attributeByKey(defs.data, attrKey)
    const languageDependent = Boolean(attr?.language_dependent)
    const cellLanguage = language ?? (languageDependent ? uiLanguage : undefined)
    const bodyValues: Json = cellEditValuesBody({
      attrKey,
      nextText,
      columnLanguage: cellLanguage,
      languageDependent,
      uiLanguage,
    })
    const fragment = bodyValues[attrKey]
    const value = cellLanguage && fragment && typeof fragment === 'object'
      ? (fragment as Json)[cellLanguage]
      : fragment
    // Enter stages the shared draft. Save writes it. A refetch must not be the write.
    stageObjectCell({
      objectId: row.id,
      attribute: attrKey,
      columnId,
      language: cellLanguage,
      baseVersion: editBaseVersion(row.id, Number(row.version ?? 0)),
      originalText: original,
      proposedText: nextText,
      value,
    })
  }

  const cancelCellEdit = () => {
    skipBlurCommitRef.current = true
    setEditingCell(null)
    setEditingDraft('')
  }

  /** Open the inline editor from row / path-values data — never from a loading placeholder. */
  const beginCellEdit = (row: ObjRow, column: string) => {
    const owned = row.id === session.objectId ? new Set(Object.keys(ownersForRow)) : undefined
    if (!isEditableColumn(column, owned)) return
    // Reopen from the draft that is on screen, not from a read that has not
    // caught up with it. Held committed values win the same way.
    const attribute = columnBaseKey(column)
    const path = parseColumnId(column).path
    const explicit = path.includes('@') ? path.split('@')[1] : undefined
    const dependent = Boolean(attributeByKey(defs.data, attribute)?.language_dependent)
    const language = explicit ?? (dependent ? uiLanguage : undefined)
    const seed = draftEditorSeed({
      objectId: row.id,
      columnId: column,
      attribute,
      language,
      serverText: cellDisplayText(row, column),
      serverVersion: Number(row.version ?? 0),
    })
    if (seed) {
      editingOriginalRef.current = seed.originalText
      skipBlurCommitRef.current = false
      setEditingDraft(seed.text)
      setEditingCell({ rowId: row.id, columnId: column })
      return
    }
    const listKey = valueListKeyForColumn(column, defs.data)
    if (listKey) {
      const current = columnBaseKey(column) === 'status'
        ? row.status
        : readIndexed(row.doc, defs.data, columnBaseKey(column))
      editingOriginalRef.current = current
      skipBlurCommitRef.current = false
      setEditingDraft(current)
      setEditingCell({ rowId: row.id, columnId: column })
      return
    }
    const needs = columnNeedsPathValues(column)
    // Prefer the live query/cache over paint-hold so edit seed matches server data.
    const source = needs ? pathValues.data : undefined
    const rowMap = source?.values?.[row.id]
    // Row present in the batch ⇒ cell is loaded (missing path key = empty, not pending).
    const pathValuesForCell = needs
      ? (rowMap ? (cellPathValues(rowMap, column) ?? []) : undefined)
      : undefined
    const initial = resolveCellEditInitial({
      needsPathValues: needs,
      pathValuesPending,
      pathValuesHasData: Boolean(pathValues.data),
      pathValuesForCell,
      fallbackText: cellDisplayText(row, column),
      formatPathValues: (values) => summarizePathValues(values).text,
    })
    if (!initial.ok) return
    editingOriginalRef.current = initial.text
    skipBlurCommitRef.current = false
    setEditingDraft(initial.text)
    setEditingCell({ rowId: row.id, columnId: column })
  }

  const paintColumn = (row: ObjRow, id: string, serverText: string) => {
    void drafts
    const attribute = columnBaseKey(id)
    const path = parseColumnId(id).path
    const explicit = path.includes('@') ? path.split('@')[1] : undefined
    const dependent = Boolean(attributeByKey(defs.data, attribute)?.language_dependent)
    const language = explicit ?? (dependent ? uiLanguage : undefined)
    const local = paintObjectCell({
      objectId: row.id,
      columnId: id,
      attribute,
      language,
      serverText,
      serverVersion: Number(row.version ?? 0),
    })
    if (local.drafted || local.held) return local
    const proposal = (openProposals.byObject.get(row.id) ?? []).find(
      (item) => item.attribute === attribute && (item.language ?? '') === (language ?? ''),
    )
    if (!proposal) return local
    return {
      text: proposal.proposedText,
      drafted: true,
      held: false,
      originalText: proposal.originalKnown ? proposal.originalText : undefined,
    }
  }
  const draftText = (row: ObjRow, id: string, serverText: string) => {
    const painted = paintColumn(row, id, serverText)
    if (!painted.drafted && !painted.held) return null
    return <CellDiff original={painted.originalText} proposed={painted.text} />
  }

  const cell = (row: ObjRow, id: string) => {
    if (editingCell && editingCell.rowId === row.id && editingCell.columnId === id) {
      const listKey = valueListKeyForColumn(id, defs.data)
      if (listKey) {
        const lists = (defs.data?.value_lists as Json[] | undefined) ?? []
        const options = optionsFor(lists, listKey)
        return (
          <div
            className="cell-editor"
            data-testid={`cell-editor-${id}`}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <Select
              value={editingDraft || undefined}
              defaultOpen
              onValueChange={(code) => {
                setEditingDraft(code)
                commitCellEdit(row, id, code)
              }}
              onOpenChange={(open) => {
                if (open) return
                window.setTimeout(() => {
                  // onValueChange clears editingCell first; otherwise Esc / click-away cancels.
                  if (skipBlurCommitRef.current) {
                    skipBlurCommitRef.current = false
                    return
                  }
                  cancelCellEdit()
                }, 0)
              }}
            >
              <SelectTrigger
                className="cell-editor-trigger"
                data-testid={`cell-editor-${id}-trigger`}
                aria-label={listKey}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      }
      return (
        <input
          data-testid={`cell-editor-${id}`}
          className="cell-editor"
          autoFocus
          value={editingDraft}
          onChange={(event) => setEditingDraft(event.target.value)}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false
              return
            }
            commitCellEdit(row, id, editingDraft)
          }}
          onKeyDown={(event) => {
            // Never let grid / shell shortcuts see keys while the caret is in the editor.
            // Enter / Escape / Tab are handled here (or by the browser for Tab).
            event.stopPropagation()
            // PageUp/PageDown would otherwise scroll the virtualized grid and detach the editor.
            if (event.key === 'PageUp' || event.key === 'PageDown') {
              event.preventDefault()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              commitCellEdit(row, id, editingDraft)
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              cancelCellEdit()
            }
          }}
          onClick={(event) => event.stopPropagation()}
        />
      )
    }
    if (id === 'key' || id === 'number') return row.key
    if (id === 'name') {
      const count = suggestionCounts.get(row.id) ?? 0
      const drafted = draftText(row, id, row.name)
      return (
        <span>
          {drafted ?? <span className="cell-name">{row.name}</span>}
          {count > 0 ? (
            <span className="suggestion-count" data-testid="suggestion-count" aria-hidden="true">{formatCount(count)} {copy.suggested}</span>
          ) : null}
        </span>
      )
    }
    if (id === 'type') return <MetaChip>{typeLabel(defs.data, row.type, uiLanguage)}</MetaChip>
    if (id === 'status') {
      const drafted = draftText(row, id, row.status)
      if (drafted) return drafted
      const label = optionLabel(defs.data, 'status', row.status, uiLanguage).trim()
      return (
        <MetaChip tone={label ? statusTone(row.status) : 'neutral'}>
          {label || EMPTY_CELL}
        </MetaChip>
      )
    }
    if (id === 'version') return <MetaChip>{row.version}</MetaChip>
    if (columnNeedsPathValues(id)) {
      const drafted = draftText(row, id, cellDisplayText(row, id))
      if (drafted) return drafted
      const values = cellPathValues(paintPathValues?.values?.[row.id], id)
      const summary = summarizePathValues(values)
      const testId = isHopPath(id) ? `hop-cell-${id}` : `path-cell-${id}`
      const entries = cellPathValues(paintPathValues?.entries?.[row.id], id)
      if (summary.text && entries?.some((e: { raw?: boolean }) => e.raw)) {
        return (
          <span data-testid={testId} title={`${summary.title} (unit not converted)`}>
            {summary.text}<span className="muted"> ·</span>
          </span>
        )
      }
      if (!summary.text) {
        if (pathValuesPending) {
          return (
            <span
              className="cell-loading"
              data-testid={testId}
              data-loading="true"
              aria-busy="true"
              aria-label={copy.loading}
            >
              …
            </span>
          )
        }
        return (
          <span className="muted" data-testid={testId}>
            {EMPTY_CELL}
          </span>
        )
      }
      return (
        <span data-testid={testId} title={summary.title}>
          {summary.text}
        </span>
      )
    }
    const server = readPathFromDoc(row.doc, defs.data, parseColumnId(id).path)
    return draftText(row, id, server) ?? server
  }
  /** Same path + cardinality (and Specific peer) with a different unit are one logical column. */
  const isUnitSibling = (existingId: string, nextId: string) => {
    if (existingId === nextId) return true
    const a = parseColumnId(existingId)
    const b = parseColumnId(nextId)
    if (a.path !== b.path) return false
    const cardA = a.qualifiers.find((q) => q.kind === 'cardinality')
    const cardB = b.qualifiers.find((q) => q.kind === 'cardinality')
    if (!cardA || !cardB || cardA.optionId !== cardB.optionId) return false
    if (cardA.optionId === 'specific') return (cardA.value ?? '') === (cardB.value ?? '')
    return true
  }
  const showField = (path: string) => {
    // Completing a Fields qualify/specific path must never hide — only ensure visible + last.
    // Drop unit-siblings (e.g. First@g when showing First@kg) so one logical hop column remains.
    // orderBase: never mutate from [] when display fell back to builtins (prefs error).
    setOrder((current) => [...orderBase(current).filter((id) => !isUnitSibling(id, path)), path])
    setHidden((current) => current.filter((id) => !isUnitSibling(id, path)))
  }
  const toggleField = (path: string) => {
    const base = orderBase(order)
    const shownNow = base.includes(path) && !hidden.includes(path)
    if (shownNow) {
      setHidden((current) => [...new Set([...current, path])])
      return
    }
    // Re-showing a hidden column (or adding fresh) always appends last — never revive at the old index.
    showField(path)
  }
  const moveField = (path: string, delta: number) => {
    setOrder((current) => {
      const base = orderBase(current)
      const next = base.includes(path) ? [...base] : [...base, path]
      const at = next.indexOf(path)
      const to = Math.min(next.length - 1, Math.max(0, at + delta))
      if (at === to) return next
      next.splice(at, 1)
      next.splice(to, 0, path)
      return next
    })
  }

  
  const catalog = useMemo(
    () => withSystemViewFields(fieldCatalogForType(defs.data ?? {}, typeKey), systemColumns),
    [defs.data, typeKey, systemColumns],
  )
  const viewColumns: ViewColumn[] = useMemo(() => {
    const cols: ViewColumn[] = []
    for (const id of shown) {
      const { path, qualifiers } = parseColumnId(id)
      // Rebuild from catalog when possible, keeping a measured value/unit part.
      const fieldPath = fieldPathForPath(path, catalog)
      const col = makeViewColumn(fieldPath, qualifiers, catalog)
      if (col) {
        // Keep the prefs/order id so Edit field → replace matches setOrder entries.
        cols.push({ ...col, id, path, qualifiers: qualifiers.length > 0 ? qualifiers : col.qualifiers })
      } else {
        cols.push({
          id,
          path,
          fieldPath,
          pathNames: fieldPath,
          qualifiers,
          leaf: {
            id: fieldPath[fieldPath.length - 1] ?? path,
            name: fieldPath[fieldPath.length - 1] ?? path,
            typeLabel: 'text',
            shape: 'text',
          },
          viaManyLink: path.includes('>'),
        })
      }
    }
    return cols
  }, [shown, catalog])

  useEffect(() => {
    publishFieldsHost({
      typeKey,
      fields: catalog,
      columns: viewColumns,
      onToggleColumn: (column) => {
        toggleField(column.id)
      },
      onShowColumn: (column) => {
        showField(column.id)
      },
      onReplaceColumn: (previousId, next) => {
        setOrder((current) => {
          const base = orderBase(current)
          const prevAt = base.indexOf(previousId)
          // Exact or unit-sibling of next already present: drop the edited one and
          // upgrade the sibling slot to next.id (e.g. First@g → First@kg).
          const siblingAt = base.findIndex((id) => id !== previousId && isUnitSibling(id, next.id))
          if (siblingAt >= 0 && previousId !== next.id) {
            const withoutPrev = base.filter((id) => id !== previousId)
            const at = withoutPrev.findIndex((id) => isUnitSibling(id, next.id))
            if (at < 0) return withoutPrev
            const copy = [...withoutPrev]
            copy[at] = next.id
            return copy.filter((id, index) => id !== next.id || index === at)
          }
          if (prevAt >= 0) {
            const copy = [...base]
            copy[prevAt] = next.id
            // Drop other unit-siblings of next; keep the replaced slot.
            return copy.filter((id, index) => index === prevAt || !isUnitSibling(id, next.id))
          }
          return [...base.filter((id) => !isUnitSibling(id, next.id)), next.id]
        })
        setHidden((current) => current.filter((id) => id !== previousId && !isUnitSibling(id, next.id)))
      },
      peerOptionsForField: (leafId, query) => {
        const needle = query.trim().toLowerCase()
        const options: PeerPickOption[] = []
        const seen = new Set<string>()
        const visibleRows = groupBy ? groupedRows : Array.from(byIndex.values())
        // Prefer articles already linked to rows in the current view.
        for (const row of visibleRows) {
          const byPath = pathValues.data?.entries?.[row.id] ?? {}
          for (const [pathKey, list] of Object.entries(byPath)) {
            if (!pathKey.includes(leafId) && !parseColumnId(pathKey).path.includes(leafId)) continue
            for (const entry of list as Array<{ text?: string; peer_id?: string }>) {
              const peerId = entry.peer_id
              if (!peerId || seen.has(peerId)) continue
              const label = entry.text || peerId
              if (needle && !`${label} ${peerId}`.toLowerCase().includes(needle)) continue
              seen.add(peerId)
              options.push({
                id: peerId,
                label,
                subtitle: row.name || row.key,
                pickValue: peerId,
                shortLabel: label,
              })
            }
          }
        }
        return options
      },
      searchPeersForField: async (_leafId, query) => searchPeerArticles(query, defs.data),
    })
    return () => publishFieldsHost(null)
  }, [typeKey, catalog, viewColumns, byIndex, groupedRows, groupBy, pathValues.data, defs.data])

  const columnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const onColumnDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = String(active.id)
    const to = String(over.id)
    setOrder((current) => {
      const next = orderBase(current)
      const oldIndex = next.indexOf(from)
      const newIndex = next.indexOf(to)
      if (oldIndex < 0 || newIndex < 0) return current
      return arrayMove(next, oldIndex, newIndex)
    })
  }

  const resolvedWidths: Record<string, number> = {}
  for (const id of shown) {
    resolvedWidths[id] = sizes[id] ?? columnFor(id).size
  }

  const newRowLabel = newObjectLabel(bound?.singular)
  const queryLabel = (queryText || filter || labelFilter || (selectionFilter === EMPTY_MANUAL_FILTER ? '' : selectionFilter)).trim()
  const hasActiveFilter = Boolean(queryLabel || pathFilters.length > 0)
  const probeLoading = !peerEmpty && found === 0 && (probe.isPending || !probe.isFetched) && !probe.isError
  const probeEmpty = !peerEmpty && probe.isFetched && found === 0
  const emptyTitle = queryLabel
    ? copy.noMatches.replace('{query}', () => queryLabel)
    : hasActiveFilter
      ? copy.noMatchesFilters
      : copy.noObjects
  const clearTableFilters = () => {
    setFilter('')
    setQueryText('')
    setSelectionFilter('')
    setActiveSelectionId('')
    setLabelFilter('')
    setPathFilters([])
  }
  const visibleRows = groupBy ? groupedRows : [...byIndex.values()]
  const visibleIds = new Set(visibleRows.map((row) => row.id))
  const tableObjectIds = [...new Set(drafts.cells.map((cell) => cell.objectId))]
    .filter((id) => visibleIds.has(id))
  const tableVersions: Record<string, number> = {}
  const tableMeta: Record<string, { key: string; type: string }> = {}
  for (const row of visibleRows) {
    tableVersions[row.id] = Number(row.version ?? 0)
    tableMeta[row.id] = { key: row.key, type: row.type }
  }
  const visibleProposalCells = [...openProposals.byObject.entries()]
    .filter(([objectId]) => visibleIds.has(objectId))
    .flatMap(([, cells]) => cells)
    .filter((cell) => cell.op === 'update')
  const proposalObjectIds = [...new Set(visibleProposalCells.map((cell) => cell.objectId))]
  const tableReview = reviewCapabilities({
    principal: me.data?.kind === 'agent' ? 'agent' : 'human',
    viaAgent: false,
    open: true,
    stale: tableObjectIds.some((id) => {
      const base = draftBaseVersion(id)
      return base != null && tableVersions[id] != null && tableVersions[id] !== base
    }) || (tableObjectIds.length === 0 && visibleProposalCells.some((cell) => cell.stale)),
    conflict: tableObjectIds.length === 0 && visibleProposalCells.some((cell) => cell.conflict),
    validationErrors: [],
    roleCanWrite: me.data ? roleCanWrite(me.data.role) : true,
  })
  const draftCount = [...new Set([...tableObjectIds, ...proposalObjectIds])].length
  return (
    <StandardTableChrome
      testId="object-table"
      newRowLabel={newRowLabel}
      onNewRow={() => setCreateOpen(true)}
      onSelectFields={() => window.dispatchEvent(new CustomEvent('braian-fields-palette', { detail: {} }))}
      selectFieldsLabel={copy.selectFields}
      rowCount={prefsReady && probe.isFetched ? (groupBy ? groups.reduce((sum, group) => sum + group.found, 0) : found) : undefined}
      filterValue={filter}
      onFilterChange={setFilter}
    >
      <ObjectDraftBar
        count={draftCount}
        canSave={tableReview.canSave}
        canDiscard={tableReview.canDiscard}
        saveReason={tableReview.saveReason}
        discardReason={tableReview.discardReason}
        pending={draftSaving}
        onSave={() => {
          const plan = draftSavePlan({
            objectIds: tableObjectIds,
            serverVersions: tableVersions,
            principal: me.data?.kind === 'agent' ? 'agent' : 'human',
            fileAsProposal: Boolean(viewingAgentRunId()),
            roleCanWrite: roleCanWrite(me.data?.role),
            proposals: visibleProposalCells,
            meta: tableMeta,
            scope: [...visibleIds],
          })
          void runDraftSave(plan, queryClient, viewingAgentRunId() ?? '').then((reason) => {
            if (isDraftSaveInFlight(reason)) return
            if (reason) reportWriteError(new Error(reason))
            else session.push(copy.saved)
          })
        }}
        onDiscard={() => {
          void runDraftDiscard({
            objectIds: [...visibleIds],
            proposals: visibleProposalCells,
            membership: openProposals.membership,
            principal: me.data?.kind === 'agent' ? 'agent' : 'human',
            viaAgent: false,
          }).then((reason) => {
            if (reason) reportWriteError(new Error(reason))
            void queryClient.invalidateQueries({ queryKey: ['proposals'] })
            void queryClient.invalidateQueries({ queryKey: ['proposal'] })
          })
        }}
      />
      <UnmappedDraftLinks proposals={openProposals.unmapped} />
      {peerSource && peerSourceView ? (
        <p className="table-source" data-testid="peer-linked-to">
          {copy.linkedTo.replace('{source}', displayViewTitle(peerSourceView, names))}
        </p>
      ) : null}
      {prefsLoadFailed ? (
        <p className="warn" data-testid="column-prefs-load-error" role="status">
          {copy.columnPrefsLoadError}
        </p>
      ) : null}
      <NewObject
        open={createOpen}
        session={session}
        typeKey={typeKey}
        singular={bound?.singular}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          session.setObjectId(created.id)
          setSelected([created.id])
          setFilter(created.number)
          setQueryText(created.number)
          setPendingSelectId(created.id)
        }}
      />
      <div
        className="toolbar-actions standard-table-filters"
        data-testid="standard-table-filters"
        onMouseDown={() => {
          if (!editingCell) return
          // Same rules as #107: blur/commit only when the draft changed.
          const row = (groupBy ? groupedRows : Array.from(byIndex.values())).find((item) => item.id === editingCell.rowId)
          if (!row) {
            cancelCellEdit()
            return
          }
          commitCellEdit(row, editingCell.columnId, editingDraft)
        }}
      >
        <TableFilters
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          setFilter={setFilter}
          setGroup={session.setGroup}
          setLabelFilter={setLabelFilter}
          setSelectionFilter={setSelectionFilter}
          activeGroup={session.group}
          activeLabelFilter={labelFilter}
          activeSelectionFilter={selectionFilter}
          activeSelectionId={activeSelectionId}
          setActiveSelectionId={setActiveSelectionId}
          activeFilter={filter}
          assortments={selectionRows}
          defs={defs.data}
        />
      </div>
      {pathFilters.length > 0 ? (
        <div className="toolbar path-filter-chips" data-testid="path-filter-chips">
          {pathFilters.map((clause) => {
            const [path, value = ''] = clause.split(':=')
            const shown = path?.endsWith('.unit') ? value : formatMeasure(value, path?.endsWith('.value') ? undefined : undefined)
            return (
              <Button key={clause} type="button" variant="ghost" className="filter-chip on" onClick={() => setPathFilters((current) => current.filter((item) => item !== clause))}>
                {path} {shown}
              </Button>
            )
          })}
        </div>
      ) : null}
      {!prefsReady ? (
        <div className="grid" data-testid="column-prefs-skeleton" aria-busy="true">
          <div className="head head-skeleton">
            {[280, 160, 160, 128, 72].map((width, index) => (
              <div key={index} className="cell" style={{ width, minWidth: width, maxWidth: width }}>
                …
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div
        className="grid"
        ref={parent}
        tabIndex={0}
        role="grid"
        aria-activedescendant={activeRow ? objectRowId(activeRow.id) : undefined}
        onKeyDown={onTableKey}
        onContextMenu={(event) => {
          // The ContextMenu key fires this on the grid itself; a row handles a pointer right-click.
          if (event.target !== event.currentTarget || prefersNativeContextMenu(event.target)) return
          event.preventDefault()
          openMenuFromKeyboard(event.target)
        }}
      >
        <DndContext sensors={columnSensors} collisionDetection={closestCenter} onDragEnd={onColumnDragEnd}>
          <SortableContext items={shown} strategy={horizontalListSortingStrategy}>
            <div className="head">
              {shown.map((id) => {
                const column = columnFor(id)
                const width = resolvedWidths[id] ?? sizes[id] ?? column.size
                return (
                  <SortableColumnHeader
                    key={id}
                    id={id}
                    width={width}
                    header={column.header}
                    sortable={Boolean(column.sort)}
                    active={activeColumn === id}
                    sortState={
                      column.sort && sort === `${column.sort}:asc`
                        ? 'asc'
                        : column.sort && sort === `${column.sort}:desc`
                          ? 'desc'
                          : false
                    }
                    onActivate={() => activateColumn(id)}
                    onSort={() => {
                      if (!column.sort) return
                      // Three states (TanStack enableSortingRemoval equivalent):
                      // none → asc → desc → none.
                      if (sort === `${column.sort}:asc`) setSort(`${column.sort}:desc`)
                      else if (sort === `${column.sort}:desc`) setSort('')
                      else setSort(`${column.sort}:asc`)
                    }}
                    onContextMenu={(event) => onHeaderMenu(id, event)}
                    onResizeStart={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      const startX = event.clientX
                      const base = width
                      const move = (moveEvent: MouseEvent) => {
                        setSizes((current) => ({ ...current, [id]: Math.max(120, base + moveEvent.clientX - startX) }))
                      }
                      const up = () => {
                        window.removeEventListener('mousemove', move)
                        window.removeEventListener('mouseup', up)
                      }
                      window.addEventListener('mousemove', move)
                      window.addEventListener('mouseup', up)
                    }}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
        {peerEmpty ? (
          <div className="table-status" data-testid="peer-empty" role="status">
            <p data-testid="peer-empty-text">{peerEmpty.text}</p>
            {bound ? (
              <Button
                type="button"
                variant="default"
                data-testid="peer-show-all"
                onClick={() => { void runCommand('view:select-source', { typeId: bound.id, viewId: view.id }) }}
              >
                {peerEmpty.showAll}
              </Button>
            ) : null}
          </div>
        ) : groupBy ? (
          <div style={{ flex: 'none' }}>
            {(() => {
              let index = 0
              return groups.map((group) => (
                <div key={group.key}>
                  <strong>{group.key || '—'} ({formatCount(group.found)})</strong>
                  {group.hits.map((row) => {
                    const rowIndex = index
                    index += 1
                    return (
                      <Row
                        key={row.id}
                        row={row}
                        index={rowIndex}
                        shown={shown}
                        sizes={resolvedWidths}
                        selected={selected}
                        cell={cell}
                        flash={flashId === row.id}
                        active={active === rowIndex}
                        activeColumn={active === rowIndex ? cellColumn : ''}
                        onColumn={activateColumn}
                        onActivate={onRowClick}
                        onMenu={onRowMenu}
                        onCellDoubleClick={(row, column) => {
                          beginCellEdit(row, column)
                        }}
                        onFocusGrid={focusGrid}
                        linkDrop={linkDropId === row.id}
                        onLinkDragStart={onLinkDragStart}
                        onLinkDragOver={onLinkDragOver}
                        onLinkDragLeave={onLinkDragLeave}
                        onLinkDrop={onLinkDrop}
                      />
                    )
                  })}
                </div>
              ))
            })()}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', flex: 'none' }}>
            {visible.map((item) => {
              const row = rowAtPainted(item.index)
              if (!row) {
                // No blank trailing row while a page is still loading.
                return null
              }
              return (
                <Row
                  key={row.id}
                  row={row}
                  index={item.index}
                  shown={shown}
                  sizes={resolvedWidths}
                  selected={selected}
                  cell={cell}
                  flash={flashId === row.id}
                  active={active === item.index}
                  activeColumn={active === item.index ? cellColumn : ''}
                  onColumn={activateColumn}
                  onActivate={onRowClick}
                  onMenu={onRowMenu}
                  onCellDoubleClick={(row, column) => {
                    beginCellEdit(row, column)
                  }}
                  onFocusGrid={focusGrid}
                  linkDrop={linkDropId === row.id}
                  onLinkDragStart={onLinkDragStart}
                  onLinkDragOver={onLinkDragOver}
                  onLinkDragLeave={onLinkDragLeave}
                  onLinkDrop={onLinkDrop}
                  style={{ position: 'absolute', transform: `translateY(${item.start}px)`, width: '100%' }}
                />
              )
            })}
          </div>
        )}
        {!peerEmpty && probe.isError ? (
          <StateNote
            className="table-status"
            tone="error"
            title={copy.objectsError}
            detail={(probe.error as Error).message}
            testId="object-table-error"
          />
        ) : probeLoading ? (
          <StateNote
            className="table-status"
            tone="loading"
            title={copy.loadingObjects}
            testId="object-table-loading"
          />
        ) : probeEmpty ? (
          <StateNote
            className="table-status"
            tone="empty"
            title={emptyTitle}
            detail={hasActiveFilter ? copy.noMatchesHint : undefined}
            action={hasActiveFilter ? (
              <Button type="button" variant="ghost" data-testid="clear-search" onClick={clearTableFilters}>
                {copy.clearSearch}
              </Button>
            ) : undefined}
            testId="object-table-empty"
          />
        ) : null}
      </div>
      )}
      {/* Fields › lives in the Ctrl+K palette */}
      {picker === 'filter' || picker === 'export' ? (
        <PathMenu
          paths={attributePaths.data?.paths ?? []}
          onClose={() => setPicker(null)}
          onPick={(path) => {
            if (picker === 'export') {
              setExportPaths((current) => current.some((item) => item.id === path.text) ? current : [...current, { id: path.text, header: path.label }])
              setPicker(null)
              return
            }
            setPathValue('')
            setPicker({ text: path.text, label: path.label })
          }}
        />
      ) : null}
      {picker && typeof picker === 'object' ? (
        <form
          className="create-row"
          data-testid="path-value"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              setPicker(null)
            }
          }}
          onSubmit={(event) => {
            event.preventDefault()
            const value = pathValue.trim()
            if (!value) return
            setPathFilters((current) => [...current, appendPathFilter('', picker.text, value)])
            setPicker(null)
          }}
        >
          <label>
            {picker.label}
            <input autoFocus aria-label={copy.pathValue} value={pathValue} onChange={(event) => setPathValue(event.target.value)} />
          </label>
          <Button type="button" variant="default" data-testid="inline-create-cancel" onClick={() => setPicker(null)}>{copy.cancel}</Button>
          <Button variant="primary" type="submit">{copy.filter}</Button>
        </form>
      ) : null}
      {moving ? (
        <MoveToGroup
          id={moving}
          defs={defs.data}
          onClose={() => setMoving(null)}
          onMoved={() => {
            setMoving(null)
            session.push(copy.saved)
            void queryClient.invalidateQueries({ queryKey: ['objects'] })
            void queryClient.invalidateQueries({ queryKey: ['path-values'] })
          }}
        />
      ) : null}
      <BulkWriteConfirm
        open={massConfirm}
        field="status"
        count={selected.length}
        onCancel={() => setMassConfirm(false)}
        onConfirm={() => {
          setMassConfirm(false)
          mass.mutate()
        }}
      />
    </StandardTableChrome>
  )
}

function MoveToGroup({
  id,
  defs,
  onClose,
  onMoved,
}: {
  id: string
  defs?: Json
  onClose: () => void
  onMoved: () => void
}) {
  const structures = (defs?.structures as Json[] | undefined) ?? []
  const choices = structures.flatMap((structure) =>
    ((structure.groups as Json[]) ?? []).map((group) => ({
      structure: String(structure.key),
      group: String(group.key),
      label: `${String(structure.key)} / ${String(group.key)}`,
    })),
  )
  const [choice, setChoice] = useState(choices[0] ? `${choices[0].structure}:${choices[0].group}` : '')
  const [error, setError] = useState('')
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        data-testid="move-to-group"
        aria-label={copy.moveToGroup}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <form
          className="dialog-form"
          onSubmit={(event) => {
            event.preventDefault()
            const [structure, group] = choice.split(':')
            if (!structure) return
            setError('')
            void api.get('/v1/objects/{id}', { params: { path: { id: id } } })
              .then((object) =>
                api.post('/v1/operations/{name}', { params: { path: { name: "move_to_group" } }, body: {
                    id,
                    structure,
                    group: group || null,
                    base_version: object.version,
                  } }),
              )
              .then(() => onMoved())
              .catch((reason: unknown) => {
                const message = writeErrorMessage(reason)
                if (message) setError(message)
              })
          }}
        >
          <label>
            {copy.moveToGroup}
            <select autoFocus value={choice} onChange={(event) => setChoice(event.target.value)}>
              {choices.map((item) => (
                <option key={`${item.structure}:${item.group}`} value={`${item.structure}:${item.group}`}>{item.label}</option>
              ))}
            </select>
          </label>
          {error ? <p className="error" data-testid="move-to-group-error">{error}</p> : null}
          <Button type="submit">{copy.save}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function columnOf(target: EventTarget) {
  const cell = target instanceof Element ? target.closest('[data-column]') : null
  return cell?.getAttribute('data-column') ?? ''
}

/** Plain-text summary of a cell's React content, for the native title tooltip. */
export function cellTitle(node: ReactNode): string | undefined {
  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node).trim()
    return text || undefined
  }
  if (Array.isArray(node)) {
    const text = node
      .map(cellTitle)
      .filter((part): part is string => Boolean(part))
      .join(' ')
      .trim()
    return text || undefined
  }
  if (isValidElement<{ children?: ReactNode; title?: string; className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>(node)) {
    if (node.props['aria-hidden'] === true || node.props['aria-hidden'] === 'true') return undefined
    if (typeof node.props.className === 'string' && (node.props.className.includes('cell-editor') || node.props.className.includes('suggestion-count'))) return undefined
    if (typeof node.props.title === 'string' && node.props.title) return node.props.title
    return cellTitle(node.props.children)
  }
  return undefined
}

function Row({
  row,
  index,
  shown,
  sizes,
  selected,
  cell,
  flash,
  active,
  activeColumn,
  onActivate,
  onColumn,
  onMenu,
  onFocusGrid,
  onCellDoubleClick,
  linkDrop,
  onLinkDragStart,
  onLinkDragOver,
  onLinkDragLeave,
  onLinkDrop,
  style,
}: {
  row: ObjRow
  index: number
  shown: string[]
  sizes: Record<string, number>
  selected: string[]
  cell: (row: ObjRow, id: string) => ReactNode
  flash: boolean
  active: boolean
  activeColumn: string
  onActivate: (index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  onColumn: (column: string) => void
  onMenu: (index: number, x: number, y: number, column: string) => void
  onFocusGrid: () => void
  onCellDoubleClick?: (row: ObjRow, column: string) => void
  linkDrop?: boolean
  onLinkDragStart?: (row: ObjRow, event: ReactDragEvent<HTMLDivElement>) => void
  onLinkDragOver?: (row: ObjRow, event: ReactDragEvent<HTMLDivElement>) => void
  onLinkDragLeave?: (row: ObjRow) => void
  onLinkDrop?: (row: ObjRow, event: ReactDragEvent<HTMLDivElement>) => void
  style?: CSSProperties
}) {
  // Background and border share this class. Focus and selection are separate:
  // only selected rows carry the fill; the focused row gets the active-cell mark.
  const isSelected = selected.includes(row.id)
  const tone = linkDrop ? '' : active && isSelected ? 'selected' : active ? 'active' : isSelected ? 'picked' : ''
  const className = ['row', tone, flash ? 'flash' : '', linkDrop ? 'link-drop' : ''].filter(Boolean).join(' ')
  return (
    <div
      id={objectRowId(row.id)}
      role="row"
      aria-selected={isSelected}
      data-testid="object-row"
      data-link-drop={linkDrop ? 'true' : undefined}
      data-index={index}
      draggable
      className={className}
      style={style}
      onMouseDown={(event) => {
        // Leave the default mousedown so a drag can start. The grid still takes focus on click.
        if (event.button !== 0) return
        onFocusGrid()
      }}
      onDragStart={(event) => onLinkDragStart?.(row, event)}
      onDragEnter={(event) => onLinkDragOver?.(row, event)}
      onDragOver={(event) => onLinkDragOver?.(row, event)}
      onDragLeave={(event) => {
        if (event.clientX === 0 && event.clientY === 0) return
        const next = event.relatedTarget
        if (next instanceof Node && (event.currentTarget.contains(next) || next === event.currentTarget)) return
        const box = event.currentTarget.getBoundingClientRect()
        if (event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom) return
        onLinkDragLeave?.(row)
      }}
      onDrop={(event) => onLinkDrop?.(row, event)}
      onClick={(event) => {
        const column = columnOf(event.target)
        // Open the cell editor on the second click; skip row activate so Detail is not the only result.
        if (event.detail >= 2 && column && onCellDoubleClick) {
          event.preventDefault()
          event.stopPropagation()
          onCellDoubleClick(row, column)
          return
        }
        if (column) onColumn(column)
        onActivate(index, event)
      }}
      onDoubleClick={(event) => {
        const column = columnOf(event.target)
        if (!column || !onCellDoubleClick) return
        event.preventDefault()
        event.stopPropagation()
        onCellDoubleClick(row, column)
      }}
      onContextMenu={(event) => {
        if (prefersNativeContextMenu(event.target)) return
        event.preventDefault()
        // Place under the row so Status/Version stay visible (H6); X stays at the pointer.
        const box = event.currentTarget.getBoundingClientRect()
        onMenu(index, event.clientX, box.bottom, columnOf(event.target))
      }}
    >
      {shown.map((id) => {
        const width = sizes[id] ?? 160
        const content = cell(row, id)
        return (
          <div
            key={id}
            className={id === activeColumn ? 'cell active-cell' : 'cell'}
            data-column={id}
            style={{ width, minWidth: width, maxWidth: width }}
            title={cellTitle(content)}
          >
            {content}
          </div>
        )
      })}
    </div>
  )
}

// The table reads search documents. Those already carry the columns on screen,
// so a list does not load full objects from Postgres.
async function loadPage(q: string, filter: string, sort: string, groupBy: string, page: number) {
  const params = new URLSearchParams({ page: String(page), per_page: String(pageSize) })
  if (q) params.set('q', q)
  params.set('lang', uiLanguage)
  if (filter) params.set('filter', filter)
  if (sort) params.set('sort', sort)
  if (groupBy) params.set('group', groupBy)
  const waitSeq = currentSearchWaitSeq()
  if (waitSeq > 0) params.set('wait_seq', String(waitSeq))
  const body = await api.get('/v1/search', { params: { query: searchQuery(params) } })
  return { ...body, page }
}

function TableFilters({
  groupBy,
  setGroupBy,
  setFilter,
  setGroup,
  setLabelFilter,
  setSelectionFilter,
  activeGroup,
  activeLabelFilter,
  activeSelectionFilter,
  activeSelectionId,
  setActiveSelectionId,
  activeFilter,
  assortments,
  defs,
}: {
  groupBy: string
  setGroupBy: (value: string) => void
  setFilter: (value: string) => void
  setGroup: (value: string | null) => void
  setLabelFilter: (value: string) => void
  setSelectionFilter: (value: string) => void
  activeGroup: string | null
  activeLabelFilter: string
  activeSelectionFilter: string
  activeSelectionId: string
  setActiveSelectionId: (value: string) => void
  activeFilter: string
  assortments: Json[]
  defs?: Json
}) {
  const clear = () => {
    setGroupBy('')
    setFilter('')
    setGroup(null)
    setLabelFilter('')
    setSelectionFilter('')
    setActiveSelectionId('')
  }
  const applyAssortment = (item: Json) => {
    const query = (item.query as Json) ?? {}
    const dynamicFilter = selectionFilterText(query)
    const emptyManual = !dynamicFilter && isEmptyManualQuery(query)
    const nextGroup = query.group ? String(query.group) : null
    const nextLabels = labelSearchFilter(query, defs)
    // Toggle off when the same selection is already active.
    const same = dynamicFilter
      ? dynamicFilter === activeSelectionFilter
      : emptyManual
        ? activeSelectionFilter === EMPTY_MANUAL_FILTER
        : (nextGroup ?? '') === (activeGroup ?? '') && nextLabels === activeLabelFilter && !activeSelectionFilter
    if (same) {
      setGroup(null)
      setLabelFilter('')
      setSelectionFilter('')
      setFilter('')
      setActiveSelectionId('')
      return
    }
    setFilter('')
    setActiveSelectionId(String(item.id ?? ''))
    if (emptyManual) {
      setSelectionFilter(EMPTY_MANUAL_FILTER)
      setGroup(null)
      setLabelFilter('')
      return
    }
    setSelectionFilter(dynamicFilter)
    setGroup(dynamicFilter ? null : nextGroup)
    setLabelFilter(dynamicFilter ? '' : nextLabels)
  }
  const assortmentActive = (item: Json) => {
    const query = (item.query as Json) ?? {}
    const dynamicFilter = selectionFilterText(query)
    if (dynamicFilter) return dynamicFilter === activeSelectionFilter || dynamicFilter === activeFilter
    if (!dynamicFilter && isEmptyManualQuery(query)) return activeSelectionFilter === EMPTY_MANUAL_FILTER
    if (activeSelectionFilter) return false
    const wantGroup = query.group ? String(query.group) : ''
    const wantLabels = labelSearchFilter(query, defs)
    if (wantGroup && activeGroup) {
      const a = groupKeyOf(wantGroup, defs)
      const b = groupKeyOf(activeGroup, defs)
      if (a === b || wantGroup === activeGroup) return wantLabels === activeLabelFilter
    }
    if (!wantGroup && wantLabels && wantLabels === activeLabelFilter && !activeGroup) return true
    return Boolean(activeSelectionId && String(item.id ?? '') === activeSelectionId)
  }
  const selectionOn = Boolean(activeGroup || activeLabelFilter || activeSelectionFilter)
  return (
    <>
      <Button type="button" variant="ghost" className={!selectionOn && groupBy === '' ? 'filter-chip on' : 'filter-chip'} onClick={clear}>{copy.all}</Button>
      <Button type="button" variant="ghost" className={groupBy === 'type_key' ? 'filter-chip on' : 'filter-chip'} onClick={() => setGroupBy(groupBy === 'type_key' ? '' : 'type_key')}>{copy.type}</Button>
      <Button type="button" variant="ghost" className={groupBy === 'a_status' ? 'filter-chip on' : 'filter-chip'} onClick={() => setGroupBy(groupBy === 'a_status' ? '' : 'a_status')}>{copy.status}</Button>
      {assortments.map((item) => (
        <Button
          key={String(item.id)}
          type="button"
          variant="ghost"
          className={assortmentActive(item) ? 'filter-chip on' : 'filter-chip'}
          data-testid="assortment"
          aria-pressed={assortmentActive(item)}
          onClick={() => applyAssortment(item)}
        >
          {assortmentDisplayName(String(item.name))}
        </Button>
      ))}
    </>
  )
}

function NewObject({
  open,
  session,
  typeKey,
  singular,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  session: PanesSession
  typeKey?: string
  singular?: string
  onOpenChange: (open: boolean) => void
  onCreated: (created: { id: string; number: string }) => void
}) {
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [chosenType, setChosenType] = useState(typeKey || '')
  const [draftFields, setDraftFields] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const choices = useMemo(
    () => typeNames(defs.data, uiLanguage).filter((item) => item.kind !== 'link'),
    [defs.data],
  )
  const showType = !typeKey && choices.length > 1
  const wasOpen = useRef(false)
  useEffect(() => {
    if (!open) {
      wasOpen.current = false
      return
    }
    if (!wasOpen.current) {
      setNumber('')
      setName('')
      setDraftFields({})
      setChosenType(typeKey || choices[0]?.key || '')
      wasOpen.current = true
      return
    }
    if (!typeKey && !chosenType && choices[0]) setChosenType(choices[0].key)
  }, [open, typeKey, choices, chosenType])
  const named = choices.find((item) => item.key === (typeKey || chosenType))
  const fieldGroups = useMemo(
    () => createObjectFields(defs.data, typeKey || chosenType, uiLanguage),
    [defs.data, typeKey, chosenType],
  )
  const dialogField = (field: (typeof fieldGroups.primary)[number]): CreateDialogField => ({
    id: field.key,
    label: field.label,
    value: field.key === 'number' ? number : field.key === 'name' ? name : (draftFields[field.key] ?? ''),
    testId: field.testId,
    autoFocus: field.key === 'number',
    options: field.options,
    multiline: field.multiline,
  })
  const fields = fieldGroups.primary.map(dialogField)
  if (showType) {
    const typeField: CreateDialogField = {
      id: 'type',
      label: copy.type,
      value: chosenType,
      testId: 'new-type',
      options: choices.map((item) => ({ value: item.key, label: item.singular || item.key })),
    }
    const nameAt = fieldGroups.primary.findIndex((field) => field.key === 'name')
    fields.splice(nameAt >= 0 ? nameAt + 1 : fields.length, 0, typeField)
  }
  const moreFields = fieldGroups.more.map(dialogField)
  return (
    <CreateDialog
      open={open}
      title={newObjectTitle(singular)}
      description={copy.createObjectHint}
      dialogTestId="new-object"
      fields={fields}
      moreFields={moreFields}
      onField={(id, value) => {
        if (id === 'number') setNumber(value)
        else if (id === 'name') setName(value)
        else if (id === 'type') setChosenType(value)
        else setDraftFields((current) => ({ ...current, [id]: value }))
      }}
      onClose={() => onOpenChange(false)}
      onSubmit={async () => {
        const nextNumber = requireText(number)
        const nextName = requireText(name)
        const nextType = typeKey || chosenType
        if (!nextType) throw new Error(copy.validation)
        const created = await api.post('/v1/objects', { body: newObjectBody({
          typeKey: nextType,
          number: nextNumber,
          name: nextName,
          group: session.group,
          structures: named?.structures,
          values: createObjectFieldValues([...fieldGroups.primary, ...fieldGroups.more], draftFields),
        }) })
        if (!('id' in created)) throw new Error(copy.validation)
        onCreated({ id: String(created.id), number: nextNumber })
        session.push(`${copy.saved} ${nextNumber}`)
        void queryClient.invalidateQueries({ queryKey: ['objects'] })
        void queryClient.invalidateQueries({ queryKey: ['path-values'] })
      }}
    />
  )
}

export function ClassAttributes({ session }: { session: PanesSession }) {
  const object = useQuery({
    queryKey: ['object', session.objectId],
    queryFn: async () => {
      const id = session.objectId ?? ''
      return reconcileObjectWrite(id, await api.get('/v1/objects/{id}', { params: { path: { id } } }))
    },
    enabled: Boolean(session.objectId),
  })
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const types = typeNames(defs.data, uiLanguage)
  const listed = session.listType ? types.find((item) => item.key === session.listType) : undefined
  if (!session.objectId || !object.data) {
    const empty = listed
      ? `Select ${withIndefinite(listed.singular)} to see the attributes on its groups.`
      : copy.classAttributesEmpty
    return (
      <div className="detail-empty" data-testid="class-empty">
        <p>{empty}</p>
      </div>
    )
  }
  const sections = classSections(defs.data, String(object.data.type ?? ''), object.data.groups, uiLanguage)
  if (sections.length === 0) {
    return (
      <div className="detail-empty" data-testid="class-empty">
        <p>{copy.noClasses}</p>
      </div>
    )
  }
  const rowCount = sections.reduce((sum, section) => sum + section.attributes.length, 0)
  return (
    <div className="class-attributes" data-testid="class-attributes">
      <StandardTableChrome testId="group-attributes-chrome" rowCount={rowCount}>
        {sections.map((section) => (
          <section key={section.id} className="class-section" data-testid="class-section">
            <h3>{section.title}</h3>
            <div className="standard-grid" role="grid">
              <div className="standard-grid-head" role="row">
                <div className="standard-grid-cell column-head" role="columnheader">{copy.attributeName}</div>
                <div className="standard-grid-cell column-head" role="columnheader">{copy.attributeType}</div>
              </div>
              {section.attributes.length === 0 ? <p className="hint">{copy.noClassAttributes}</p> : null}
              {section.attributes.map((attribute) => (
                <div key={attribute.id} className="standard-grid-row" role="row" data-testid="class-attribute">
                  <div className="standard-grid-cell" role="gridcell">{attribute.label}</div>
                  <div className="standard-grid-cell" role="gridcell">{attribute.kind}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </StandardTableChrome>
    </div>
  )
}

/** A soft-deleted object is gone from reads, not a broken graph or validation. */
function objectGone(error: unknown) {
  return error instanceof ApiError && error.status === 410
}

export function ObjectDetail({ session }: { session: PanesSession }) {
  const queryClient = useQueryClient()
  const object = useQuery({
    queryKey: ['object', session.objectId],
    queryFn: async () => {
      const id = session.objectId ?? ''
      return reconcileObjectWrite(id, await api.get('/v1/objects/{id}', { params: { path: { id } } }))
    },
    enabled: Boolean(session.objectId),
  })
  const provenance = useQuery({
    queryKey: ['object-origin', session.objectId],
    queryFn: async () => {
      const response = await fetch(`/v1/objects/${session.objectId}?include=owners,origin`, { credentials: 'include' })
      if (!response.ok) return { owners: {} as Record<string, string>, origin: null as Json | null }
      return response.json() as Promise<{ owners?: Record<string, string>; origin?: Json | null }>
    },
    enabled: Boolean(session.objectId),
  })
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const suggestions = useQuery({
    queryKey: ['proposals', 'detail', session.objectId],
    queryFn: () => api.get('/v1/proposals', { params: { query: { status: 'open', limit: 200 } } }),
    enabled: Boolean(session.objectId),
  })
  const drafts = useSyncExternalStore(subscribeObjectDrafts, getObjectDraftSnapshot, getObjectDraftSnapshot)
  const draftSaving = useObjectDraftSaving()
  const openProposals = useOpenObjectProposals()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get('/v1/me'), retry: false })
  const [error, setError] = useState('')
  const [flashId, setFlashId] = useState('')
  const [showMoreFields, setShowMoreFields] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  useLayoutEffect(() => {
    const form = formRef.current
    if (!form) return
    const apply = (width: number) => {
      form.dataset.narrow = width < 360 ? 'true' : 'false'
    }
    apply(form.clientWidth)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      apply(entry ? entry.contentRect.width : form.clientWidth)
    })
    observer.observe(form)
    return () => observer.disconnect()
  }, [session.objectId, object.data])
  useEffect(() => onFlash(setFlashId), [])
  useEffect(() => {
    setError('')
    setShowMoreFields(false)
  }, [session.objectId])
  useEffect(() => {
    if (!session.objectId || !object.data) return
    const stored = (object.data.values as Json) ?? {}
    const language = session.language || 'en'
    enrichSelection({
      id: session.objectId ?? '',
      key: recordNumber(stored) || String(jsonRecord(object.data)?.key ?? ''),
      name: recordTitle(stored, language),
      type: String(object.data.type ?? ''),
      version: String(object.data.version ?? ''),
    })
  }, [session.objectId, session.language, object.data])
  if (!session.objectId) {
    return (
      <div className="detail-empty" data-testid="detail-empty">
        <p>{emptyDetail(typeNames(defs.data, uiLanguage), session.listType)}</p>
        <ul>
          <li><kbd>↑</kbd><kbd>↓</kbd> {copy.detailKeysMove}</li>
          <li><kbd>Enter</kbd> {copy.detailKeysOpen}</li>
          <li><kbd>Ctrl</kbd><kbd>K</kbd> {copy.detailKeysPalette}</li>
        </ul>
      </div>
    )
  }
  if (objectGone(object.error)) return <StateNote tone="empty" title={copy.objectDeleted} detail={copy.objectDeletedHint} testId="detail-deleted" />
  if (object.isError) return <StateNote tone="error" title={copy.graphError} detail={copy.validation} testId="detail-error" />
  if (!object.data || !session.objectId) return <StateNote tone="loading" title={copy.loading} />
  const objectId = session.objectId
  const serverValues = (object.data.values as Json) ?? {}
  const serverVersion = Number(object.data.version ?? 0)
  const values = overlayValues(objectId, serverValues, serverVersion)
  const attributes = (defs.data?.attributes as Json[] | undefined) ?? []
  const lists = (defs.data?.value_lists as Json[] | undefined) ?? []
  const families = (defs.data?.unit_families as Json[] | undefined) ?? []
  const label = recordNumber(serverValues) || String(object.data.id ?? '')
  const suggestionCount = suggestionIndex(suggestions.data).get(objectId) ?? 0
  const localCells = drafts.cells.filter((cell) => cell.objectId === objectId)
  // Delete/create/model rows have no ordinary value cell. They stay visible in
  // the proposal review link instead of being accepted from a hidden diff.
  const proposalCells = (openProposals.byObject.get(objectId) ?? []).filter((cell) => cell.op === 'update')
  const languageRecord = (value: unknown): Json =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Json) }
      : { en: value as Json[string] }
  const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  const fieldDisplayValue = (key: string): unknown => {
    let value = values[key]
    for (const cell of proposalCells.filter((item) => item.attribute === key)) {
      if (localCells.some((item) =>
        item.attribute === key && (item.language ?? '') === (cell.language ?? ''))) continue
      if (cell.language) {
        const record = languageRecord(value)
        record[cell.language] = cell.proposed as Json[string]
        value = record
      } else {
        value = cell.proposed
      }
    }
    return value
  }
  const stageField = (key: string, next: unknown) => {
    const attribute = attributes.find((item) => item.key === key)
    const baseVersion = editBaseVersion(objectId, serverVersion)
    const before = values[key]
    const shown = fieldDisplayValue(key)
    if (attribute?.language_dependent) {
      const beforeRecord = languageRecord(before)
      const shownRecord = languageRecord(shown)
      const afterRecord = languageRecord(next)
      const languages = new Set([
        ...Object.keys(beforeRecord),
        ...Object.keys(shownRecord),
        ...Object.keys(afterRecord),
      ])
      for (const language of languages) {
        // Compare with what the person sees. An untouched AI pending value is
        // not a human edit and must not turn into a conflicting draft.
        if (sameJson(shownRecord[language], afterRecord[language])) continue
        stageObjectCell({
          objectId,
          attribute: key,
          columnId: `${key}@${language}`,
          language,
          baseVersion,
          originalText: displayOf(beforeRecord[language]),
          proposedText: displayOf(afterRecord[language]),
          value: afterRecord[language],
        })
      }
      return
    }
    if (sameJson(shown, next)) return
    stageObjectCell({
      objectId,
      attribute: key,
      columnId: key,
      baseVersion,
      originalText: displayOf(before),
      proposedText: displayOf(next),
      value: next,
    })
  }
  const detailReview = reviewCapabilities({
    principal: me.data?.kind === 'agent' ? 'agent' : 'human',
    viaAgent: false,
    open: true,
    stale: (draftBaseVersion(objectId) != null && draftBaseVersion(objectId) !== serverVersion)
      || (localCells.length === 0 && proposalCells.some((cell) => cell.stale)),
    conflict: localCells.length === 0 && proposalCells.some((cell) => cell.conflict),
    // A failed save is displayed as its own error and must not block retry.
    validationErrors: [],
    roleCanWrite: me.data ? roleCanWrite(me.data.role) : true,
  })
  const save = () => {
    setError('')
    const plan = draftSavePlan({
      objectIds: [objectId],
      serverVersions: { [objectId]: serverVersion },
      principal: me.data?.kind === 'agent' ? 'agent' : 'human',
      fileAsProposal: Boolean(viewingAgentRunId()),
      roleCanWrite: me.data ? roleCanWrite(me.data.role) : true,
      validationErrors: [],
      proposals: proposalCells,
      meta: { [objectId]: { key: label, type: String(object.data?.type ?? '') } },
      scope: [objectId],
    })
    void runDraftSave(plan, queryClient, viewingAgentRunId() ?? '').then((reason) => {
      if (isDraftSaveInFlight(reason)) return
      if (reason) setError(reason)
      else {
        setError('')
        session.push(`${copy.saved} ${label}`)
        void queryClient.invalidateQueries({ queryKey: ['proposals'] })
        void queryClient.invalidateQueries({ queryKey: ['proposal'] })
        void queryClient.invalidateQueries({ queryKey: ['agent-run'] })
      }
    })
  }
  const status = textValue(values.status)
  const number = recordNumber(values)
  const name = recordTitle(values, uiLanguage)
  const inAgentSession = Boolean(viewingAgentRunId())
  const dirty = localCells.length > 0 || proposalCells.length > 0
  const typeDef = ((defs.data?.types as Json[]) ?? []).find((item) => item.key === object.data?.type)
  const typeIds = new Set(((typeDef?.attributes as unknown[]) ?? []).map(String))
  const fileKeys = attributes
    .filter((item) => typeIds.has(String(item.id)) && String((item.kind as Json)?.type) === 'file_ref')
    .map((item) => String(item.key))
  const proposalKeys = proposalCells
    .map((cell) => cell.attribute)
    .filter((attribute) => attribute !== '$delete')
  const valueKeys = [...new Set([...Object.keys(values), ...proposalKeys, ...fileKeys])]
  const { primaryKeys, moreKeys } = splitDetailKeys(defs.data, valueKeys)
  const visibleKeys = showMoreFields ? [...primaryKeys, ...moreKeys] : primaryKeys
  const owners = provenance.data?.owners ?? {}
  const origin = provenance.data?.origin
  const renderField = (key: string) => {
    const attribute = attributes.find((item) => item.key === key)
    const kind = (attribute?.kind as Json) ?? {}
    const fieldLabel = textValue((attribute?.labels as Json) ?? key, uiLanguage) || key
    const owner = owners[key]
    const localKeyCells = localCells.filter((cell) => cell.attribute === key)
    const proposalKeyCells = proposalCells.filter((cell) => cell.attribute === key)
    const controlClass = localKeyCells.length > 0
      ? 'control draft-user'
      : proposalKeyCells.length > 0
        ? 'control draft-agent'
        : 'control'
    return (
      <div key={key} className={owner ? 'field locked' : 'field'} data-testid={owner ? 'locked-field' : undefined}>
        <label>{fieldLabel}{owner ? ` · ${copy.ownedBy} ${owner}` : ''}</label>
        <div className={controlClass}>
          <Editor
            kind={String(kind.type ?? 'text')}
            form={String(kind.form ?? '')}
            multiple={Boolean(attribute?.multiple)}
            languageDependent={Boolean(attribute?.language_dependent)}
            languages={modelLanguages(defs.data)}
            value={fieldDisplayValue(key)}
            options={optionsFor(lists, String(kind.list ?? ''))}
            units={unitsFor(families, String(kind.unit_family ?? ''))}
            readOnly={Boolean(owner)}
            onChange={(next) => stageField(key, next)}
          />
          {proposalKeyCells.map((cell) => (
            <div key={cell.id} className="pending-field" data-testid="pending-field" data-field={key} data-stale={cell.stale ? 'true' : 'false'}>
              <span className="pending-chip" data-testid={cell.stale ? 'pending-stale' : 'pending-chip'}>{cell.stale ? copy.proposalStale : copy.pending}</span>
              <CellDiff original={cell.originalKnown ? cell.originalText : undefined} proposed={cell.proposedText} />
              {cell.stale && cell.staleReason ? <span data-testid="agent-stale-reason">{cell.staleReason}</span> : null}
            </div>
          ))}
        </div>
        {owner && origin && typeof origin === 'object' ? (
          <p className="hint" data-testid="field-origin">
            {copy.sourceObject} {String((origin as Json).source_key ?? '')}
          </p>
        ) : null}
      </div>
    )
  }
  return (
    <form
      ref={formRef}
      className={flashId === session.objectId ? 'detail-form form flash' : 'detail-form form'}
      data-testid="object-detail"
      onSubmit={(event) => {
        // Enter in a Detail field stages nothing and never saves.
        event.preventDefault()
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault()
          save()
          return
        }
        if (event.ctrlKey || event.altKey || event.metaKey) return
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].includes(event.key)) return
        const target = event.target as HTMLElement
        if (target.tagName === 'TEXTAREA' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) return
        const fields = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-field]')]
        const index = fields.indexOf(target)
        if (event.key === 'Escape') {
          if (target.closest('[role="listbox"]')) return
          discardObjectDraft(session.objectId ?? '')
          return
        }
        if (index < 0) return
        event.preventDefault()
        const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : fields.length - 1
        fields[Math.max(0, Math.min(fields.length - 1, next))]?.focus()
      }}
    >
      <div className="detail-scroll">
        <header className="detail-head">
          <div className="detail-title">
            <strong title={name || number}>{name || number}</strong>
            {number ? <span className="detail-id">{number}</span> : null}
          </div>
          <DetailMeta
            createdAt={typeof object.data.created_at === 'string' ? object.data.created_at : ''}
            updatedAt={typeof object.data.updated_at === 'string' ? object.data.updated_at : ''}
            updatedBy={object.data.updated_by}
          />
          {inAgentSession ? null : (
            <div className="detail-actions">
              <Button
                type="button"
                variant="danger"
                data-testid="delete-object-detail"
                onClick={() => requestDeleteObjects([objectId])}
              >
                {copy.delete}
              </Button>
            </div>
          )}
          <div className="field-chips">
            <MetaChip>{typeLabel(defs.data, String(object.data.type), uiLanguage)}</MetaChip>
            <MetaChip tone={status ? statusTone(status) : 'neutral'}>
              {status ? optionLabel(defs.data, 'status', status, uiLanguage) : EMPTY_CELL}
            </MetaChip>
            <MetaChip>{String(object.data.version ?? '')}</MetaChip>
            {suggestionCount > 0 ? <span className="suggestion-count" data-testid="suggestion-count">{formatCount(suggestionCount)} {copy.suggested}</span> : null}
          </div>
        </header>
        <LinkSections
          objectId={session.objectId}
          typeKey={String(object.data.type ?? '')}
          objectName={name || number}
          objectKey={number}
          defs={defs.data}
          defsLoading={defs.isLoading}
          links={(object.data.links as never) ?? []}
          onOpen={(id) => session.setObjectId(id)}
        />
        {fieldSections(visibleKeys).map((section) => (
          <section key={section.id} className="field-card">
            <h3>{section.title}</h3>
            {section.keys.map((key) => renderField(key))}
          </section>
        ))}
        {moreKeys.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            className="detail-more"
            data-testid="detail-show-more-fields"
            aria-expanded={showMoreFields}
            onClick={() => setShowMoreFields((shown) => !shown)}
          >
            {showMoreFields ? copy.showFewerFields : copy.showMoreFields}
          </Button>
        ) : null}
        {error ? <p className="error" data-testid="detail-error">{error}</p> : null}
      </div>
      <UnmappedDraftLinks proposals={openProposals.unmapped} />
      {dirty ? (
        <ObjectDraftBar
          count={localCells.length + (proposalCells.length > 0 ? 1 : 0)}
          canSave={detailReview.canSave}
          canDiscard={detailReview.canDiscard}
          saveReason={detailReview.saveReason}
          discardReason={detailReview.discardReason}
          pending={draftSaving}
          onSave={save}
          onDiscard={() => {
            void runDraftDiscard({
              objectIds: [objectId],
              proposals: proposalCells,
              membership: openProposals.membership,
              principal: me.data?.kind === 'agent' ? 'agent' : 'human',
              viaAgent: false,
            }).then((reason) => {
              if (reason) setError(reason)
              void queryClient.invalidateQueries({ queryKey: ['proposals'] })
              void queryClient.invalidateQueries({ queryKey: ['proposal'] })
            })
          }}
        />
      ) : null}
    </form>
  )
}

const fieldSectionDefs: Array<{ id: string; title: string; keys: string[] }> = [
  { id: 'identity', title: copy.identity, keys: ['number', 'name', 'company_name', 'gtin', 'brand', 'org_number', 'gln'] },
  { id: 'description', title: copy.description, keys: ['description', 'ingredients'] },
  { id: 'classification', title: copy.classification, keys: ['status', 'allergens', 'traces', 'labels', 'nutriscore', 'nova', 'country', 'country_of_origin', 'certifications', 'storage', 'packaging', 'packaging_material', 'deposit', 'active'] },
  { id: 'measures', title: copy.measures, keys: ['net_weight', 'net_volume', 'units_per_pack', 'height', 'width', 'depth', 'gross_weight', 'energy', 'fat', 'saturated_fat', 'carbohydrates', 'sugars', 'fiber', 'protein', 'salt', 'fat_content', 'cocoa_content', 'caffeine', 'shelf_life_days', 'lead_time_days', 'co2_footprint'] },
  { id: 'dates', title: copy.dates, keys: ['launched'] },
  { id: 'references', title: copy.references, keys: ['product', 'supplier', 'replaces', 'image', 'website'] },
]

function fieldSections(keys: string[]) {
  const known = new Set<string>()
  const sections = fieldSectionDefs.flatMap((section) => {
    const present = section.keys.filter((key) => keys.includes(key))
    present.forEach((key) => known.add(key))
    return present.length > 0 ? [{ ...section, keys: present }] : []
  })
  const rest = keys.filter((key) => !known.has(key))
  if (rest.length > 0) sections.push({ id: 'other', title: copy.other, keys: rest })
  return sections
}

function optionsFor(lists: Json[], key: string) {
  const list = lists.find((item) => item.key === key)
  return ((list?.options as Json[]) ?? []).map((option) => ({
    code: String(option.code),
    label: textValue(option.labels, uiLanguage) || String(option.code),
  }))
}

function unitsFor(families: Json[], id: string) {
  const family = families.find((item) => item.id === id || item.key === id)
  return ((family?.units as Json[]) ?? []).map((unit) => String(unit.code))
}

function modelLanguages(defs: Json | undefined): string[] {
  const listed = ((defs?.languages as unknown[]) ?? []).map(String).filter(Boolean)
  return listed.length > 0 ? listed : ['en']
}

function Editor({
  kind,
  form,
  value,
  languageDependent,
  languages,
  multiple,
  options,
  units,
  onChange,
  readOnly = false,
}: {
  kind: string
  form: string
  multiple: boolean
  languageDependent: boolean
  languages: string[]
  value: unknown
  options: Array<{ code: string; label: string }>
  units: string[]
  onChange: (value: unknown) => void
  readOnly?: boolean
}) {
  if (readOnly && !languageDependent) {
    return <input data-field="true" readOnly value={textValue(value)} title={textValue(value)} />
  }
  if (languageDependent) {
    const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : { en: textValue(value) }
    const cards = languages.length > 0 ? languages : ['en']
    return (
      <div className="langs">
        {cards.map((language) => (
          <label key={language} className="lang-row">
            <span className="lang-tag">{language}</span>
            {form === 'long' ? (
              <AutoResizeTextarea data-field="true" readOnly={readOnly} value={textValue(record[language])} onChange={(event) => onChange({ ...record, [language]: event.target.value })} />
            ) : (
              <input data-field="true" readOnly={readOnly} value={textValue(record[language])} title={textValue(record[language])} onChange={(event) => onChange({ ...record, [language]: event.target.value })} />
            )}
          </label>
        ))}
      </div>
    )
  }
  if (multiple && Array.isArray(value) && kind !== 'value_list') {
    const items = value.map((item) => textValue(item))
    return (
      <div className="choices">
        {items.map((item) => <span key={item} className="meta-chip">{item}</span>)}
        <input
          data-field="true"
          value=""
          placeholder="+"
          onChange={(event) => {
            const next = event.target.value.trim()
            if (next) onChange([...items, next])
          }}
        />
      </div>
    )
  }
  if (kind === 'object_ref') return <ObjectRefField value={value} onChange={onChange} />
  if (kind === 'file_ref') return <FileField value={value} onChange={onChange} />
  if (kind === 'value_list' && options.length > 0 && multiple) {
    const picked = Array.isArray(value) ? value.map(String) : []
    return (
      <div className="choices">
        {options.map((option) => {
          const on = picked.includes(option.code)
          return (
            <Button
              key={option.code}
              type="button"
              variant="ghost"
              className={on ? 'choice-chip on' : 'choice-chip'}
              aria-pressed={on}
              onClick={() => onChange(on ? picked.filter((code) => code !== option.code) : [...picked, option.code])}
            >
              {option.label}
            </Button>
          )
        })}
      </div>
    )
  }
  if (kind === 'value_list' && options.length > 0) {
    const current = textValue(value)
    const currentLabel = options.find((option) => option.code === current)?.label ?? current
    return (
      <Select value={current || undefined} onValueChange={onChange}>
        <SelectTrigger data-field="true" title={currentLabel}>
          <SelectValue placeholder={EMPTY_CELL} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (kind === 'boolean') {
    return <Switch data-field="true" checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
  }
  if (kind === 'range') {
    const record = (value && typeof value === 'object' ? value : {}) as Json
    return (
      <span className="measure">
        <input data-field="true" value={textValue(record.min)} title={textValue(record.min)} onChange={(event) => onChange({ ...record, min: event.target.value })} />
        <input data-field="true" value={textValue(record.max)} title={textValue(record.max)} onChange={(event) => onChange({ ...record, max: event.target.value })} />
        <UnitSuffix units={units} value={String(record.unit ?? units[0] ?? '')} onChange={(unit) => onChange({ ...record, unit })} />
      </span>
    )
  }
  if (kind === 'number') {
    const record = (value && typeof value === 'object' ? value : { value }) as Json
    return (
      <span className="measure">
        <input data-field="true" value={textValue(record.value)} title={textValue(record.value)} onChange={(event) => onChange({ ...record, value: event.target.value })} />
        <UnitSuffix units={units} value={String(record.unit ?? units[0] ?? '')} onChange={(unit) => onChange({ ...record, unit })} />
      </span>
    )
  }
  if (form === 'long' || (typeof value === 'string' && value.length > 80)) {
    return <AutoResizeTextarea data-field="true" value={textValue(value)} onChange={(event) => onChange(event.target.value)} />
  }
  return <input data-field="true" value={textValue(value)} title={textValue(value)} onChange={(event) => onChange(event.target.value)} />
}

function UnitSuffix({ units, value, onChange }: { units: string[]; value: string; onChange: (unit: string) => void }) {
  if (units.length === 0) return null
  if (units.length === 1) return <span className="meta-chip">{units[0]}</span>
  return (
    <Select value={value || units[0]} onValueChange={onChange}>
      <SelectTrigger className="unit-suffix" data-field="true" aria-label={copy.unit}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {units.map((unit) => (
          <SelectItem key={unit} value={unit}>{unit}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function FileField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const id = typeof value === 'string' ? value : ''
  const label = name || (id ? `${copy.file} ${id.slice(0, 8)}` : '')
  return (
    <div className="file-field">
      <input
        ref={input}
        className="file-input"
        type="file"
        data-testid="file-input"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) return
          setName(file.name)
          onChange(crypto.randomUUID())
          event.target.value = ''
        }}
      />
      {label ? (
        <span data-testid="file-chip"><MetaChip>{label}</MetaChip></span>
      ) : (
        <span className="hint" data-testid="file-chip">{copy.noFile}</span>
      )}
      <Button type="button" variant="default" data-field="true" onClick={() => input.current?.click()}>
        {id ? copy.replaceFile : copy.chooseFile}
      </Button>
      {id ? (
        <Button
          type="button"
          variant="default"
          onClick={() => {
            setName('')
            onChange(null)
          }}
        >
          {copy.clearFile}
        </Button>
      ) : null}
    </div>
  )
}

function ObjectRefField({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const id = typeof value === 'string' ? value : ''
  const current = useQuery({
    queryKey: ['object-ref', id],
    queryFn: () =>
      batchGetObjects([id], { groups: true, fields: ['number', 'name', 'company_name'], languages: [uiLanguage] }).then(
        (rows) => rows[0] ?? null,
      ),
    enabled: /^[0-9a-f-]{36}$/i.test(id),
  })
  const label = current.data
    ? `${recordNumber(current.data.values as Json)} · ${recordTitle(current.data.values as Json, uiLanguage)}`
    : ''
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const found = useQuery({
    queryKey: ['ref-pick', q],
    queryFn: () => api.get('/v1/search', { params: { query: { q: q, per_page: 8, lang: uiLanguage } } }),
    enabled: open && q.trim().length > 1,
  })
  return (
    <div className="ref">
      <input
        data-testid="object-ref"
        data-field="true"
        value={open ? q : label}
        placeholder={copy.pickObject}
        onFocus={() => {
          setOpen(true)
          setQ('')
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => setQ(event.target.value)}
      />
      {open && q.trim().length > 1 ? (
        <div className="ref-menu">
          {((found.data?.hits as Json[]) ?? []).map((hit) => {
            const doc = (hit.document as Json) ?? hit
            return (
              <Button
                type="button"
                variant="default"
                key={String(doc.id)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  onChange(String(doc.id))
                  setOpen(false)
                }}
              >
                {String(doc.key)} · {catalogName(doc)}
              </Button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function GraphView({ session, view }: { session: PanesSession; view?: PanesView }) {
  const modelSource = String(view?.state?.source ?? '') === 'data_model'
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => api.get('/v1/stats'),
    enabled: modelSource,
  })
  const graph = useQuery({
    queryKey: ['graph', session.objectId],
    queryFn: () => api.get('/v1/objects/{id}/graph', { params: { path: { id: session.objectId ?? '' } } }),
    enabled: Boolean(session.objectId) && !modelSource,
  })
  const object = useQuery({
    queryKey: ['object', session.objectId],
    queryFn: () => api.get('/v1/objects/{id}', { params: { path: { id: session.objectId ?? '' } } }),
    enabled: Boolean(session.objectId) && !modelSource,
  })
  if (modelSource) {
    if (defs.isError || stats.isError) return <StateNote tone="error" title={copy.graphError} testId="graph" />
    if (!defs.data || !stats.data) return <StateNote tone="loading" title={copy.graphLoading} testId="graph" />
    return <GraphMap key="data-model" defs={defs.data} model={{ defs: defs.data, stats: stats.data }} />
  }
  if (!session.objectId) return <StateNote tone="empty" title={emptyGraph(typeNames(defs.data, uiLanguage), session.listType)} testId="graph" />
  if (objectGone(object.error)) return <StateNote tone="empty" title={copy.objectDeleted} detail={copy.objectDeletedHint} testId="graph" />
  if (graph.isError || object.isError) return <StateNote tone="error" title={copy.graphError} testId="graph" />
  if (!graph.data || !object.data) return <StateNote tone="loading" title={copy.graphLoading} testId="graph" />
  return (
    <GraphMap
      data={graph.data}
      values={(object.data.values as Json) ?? {}}
      defs={defs.data}
      onOpen={(id) => {
        if (id) session.setObjectId(id)
      }}
    />
  )
}

export function HistoryView({ session }: { session: PanesSession }) {
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const changes = useQuery({
    queryKey: ['history', session.objectId],
    queryFn: () => api.get('/v1/objects/{id}/changes', { params: { path: { id: session.objectId ?? '' } } }),
    enabled: Boolean(session.objectId),
  })
  const [open, setOpen] = useState<number | null>(null)
  const [travel, setTravel] = useState(false)
  const [seq, setSeq] = useState(0)
  const rows = [...(changes.data ?? [])].sort((left, right) => Number(right.seq) - Number(left.seq))
  const current = seq || Number(rows[0]?.seq ?? 0)
  const asOf = useQuery({
    queryKey: ['asof', session.objectId, current],
    queryFn: () => api.get('/v1/objects/{id}/as-of', { params: { path: { id: session.objectId ?? '' }, query: { seq: Number(current) } } }),
    enabled: Boolean(session.objectId && current && travel),
  })
  const rollback = useMutation({
    mutationFn: (at: number) =>
      api.post('/v1/objects/{id}/rollback', { params: { path: { id: session.objectId ?? '' } }, body: { seq: at } }),
    onSuccess: (proposal) => {
      const id = String(proposal.id)
      // Same as assortment / model proposes: open the review dialog so Confirm applies it.
      publishProposal(id)
      session.setProposalId(id)
      session.push(copy.proposed)
    },
    onError: (reason: unknown) => {
      reportWriteError(reason)
    },
  })
  const seqs = rows.map((row) => Number(row.seq)).sort((left, right) => left - right)
  const minSeq = seqs[0] ?? 0
  const maxSeq = seqs.at(-1) ?? 0
  if (!session.objectId) return <StateNote tone="empty" title={copy.historyEmpty} testId="history" />
  return (
    <div data-testid="history">
      <div className="history-head">
        <span className="hint">
          {changes.isPending
            ? copy.loading
            : `${formatCount(rows.length)} ${rows.length === 1 ? copy.oneChange : copy.manyChanges}`}
        </span>
        <Button type="button" variant="default" data-testid="time-travel" aria-pressed={travel} onClick={() => setTravel((value) => !value)}>
          <HistoryIcon size={14} aria-hidden="true" />
          {copy.timeTravel}
        </Button>
      </div>
      {travel ? (
        <div className="history-asof">
          <span className="hint">{copy.asOf}</span>
          {rows.length > 0 ? (
            <Slider
              data-testid="as-of"
              min={minSeq}
              max={maxSeq === minSeq ? minSeq + 1 : maxSeq}
              step={1}
              disabled={maxSeq === minSeq}
              value={[Math.min(maxSeq === minSeq ? minSeq : maxSeq, Math.max(minSeq, current || maxSeq))]}
              onValueChange={([next]) => setSeq(nearestSeq(seqs, next ?? maxSeq))}
              aria-label={copy.asOf}
            />
          ) : null}
          <span data-testid="as-of-when"><MetaChip>{formatWhen(rows.find((row) => Number(row.seq) === current)?.at)}</MetaChip></span>
          <dl className="asof">
            {Object.entries((asOf.data?.values as Json | undefined) ?? {}).map(([key, value]) => (
              <div key={key}>
                <dt>{fieldLabel(defs.data, key)}</dt>
                <dd>{renderValue(value, key, defs.data)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <div className="timeline">
        {changes.isError ? (
          <StateNote
            tone="error"
            title={copy.historyError}
            detail={(changes.error as Error).message}
            testId="history-error"
          />
        ) : changes.isPending ? (
          <StateNote tone="loading" title={copy.loading} testId="history-loading" />
        ) : rows.length === 0 ? (
          <StateNote tone="empty" title={copy.historyEmpty} testId="history-empty" />
        ) : null}
        {!changes.isError && !changes.isPending ? rows.map((row) => {
          const at = Number(row.seq)
          const expanded = open === at
          const created = isCreate(row)
          return (
            <article
              key={String(row.seq)}
              className={expanded ? 'selected' : ''}
              data-active={expanded ? 'true' : undefined}
              onClick={() => setOpen(expanded ? null : at)}
            >
              <header className="history-line">
                <strong>{historyWho(row)}</strong>
                <time dateTime={String(row.at ?? '')}>{relativeTime(row.at)}</time>
              </header>
              {created ? (
                <ul className="field-diff">
                  <li className="history-created">{copy.created}</li>
                </ul>
              ) : (
                <FieldDiff lines={diffLines(row.diff, defs.data)} />
              )}
              {expanded ? (
                <div className="history-actions" onClick={(event) => event.stopPropagation()}>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="view-as-of"
                    onClick={() => {
                      setSeq(at)
                      setTravel(true)
                    }}
                  >
                    {copy.viewAsItWas}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="rollback"
                    onClick={() => rollback.mutate(rollbackTargetSeq(seqs, at))}
                  >
                    {copy.rollback}
                  </Button>
                </div>
              ) : null}
            </article>
          )
        }) : null}
      </div>
    </div>
  )
}

export { DataModel } from './data-model'

const LANGS = ['sv', 'en', 'de']

function isLanguageMap(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((key) => LANGS.includes(key))
}

function attributeBy(defs: Json | undefined, key: string) {
  return ((defs?.attributes as Json[]) ?? []).find((item) => String(item.id) === key || String(item.key) === key)
}

function fieldLabel(defs: Json | undefined, key: string) {
  if (key === '$groups') return copy.group
  const attribute = attributeBy(defs, key)
  return textValue(attribute?.labels, uiLanguage) || String(attribute?.key ?? key)
}

function nearestSeq(seqs: number[], value: number) {
  if (seqs.length === 0) return value
  return seqs.reduce((best, seq) => (Math.abs(seq - value) < Math.abs(best - value) ? seq : best))
}

function formatWhen(value: unknown) {
  return formatTimestamp(value)
}

function renderValue(value: unknown, field: string, defs: Json | undefined): ReactNode {
  if (value == null || value === '') return ''
  if (isLanguageMap(value)) {
    const present = LANGS.filter((language) => language in value && value[language] != null)
    return (
      <span className="lang-values">
        {present.map((language) => (
          <span key={language} className="lang-inline">
            <MetaChip>{language}</MetaChip>
            <span>{textValue(value[language], language)}</span>
          </span>
        ))}
      </span>
    )
  }
  const attribute = attributeBy(defs, field)
  const kind = (attribute?.kind as Json) ?? {}
  const kindType = String(kind.type ?? '')
  const attrKey = String(attribute?.key ?? field)
  if (Array.isArray(value)) {
    return (
      <span className="lang-inline">
        {value.map((item, index) => {
          const code = textValue(item)
          if (!code) return null
          if (kindType === 'value_list') {
            const list = String(kind.list ?? attrKey)
            return (
              <MetaChip key={`${code}-${index}`} tone={list === 'status' ? statusTone(code) : 'neutral'}>
                {optionLabel(defs, list, code, uiLanguage)}
              </MetaChip>
            )
          }
          return <MetaChip key={`${code}-${index}`}>{code}</MetaChip>
        })}
      </span>
    )
  }
  if (kindType === 'value_list') {
    const code = textValue(value)
    const list = String(kind.list ?? attrKey)
    return <MetaChip tone={list === 'status' ? statusTone(code) : 'neutral'}>{optionLabel(defs, list, code, uiLanguage)}</MetaChip>
  }
  if (field === 'type' || field === 'type_key' || attrKey === 'type' || attrKey === 'type_key') {
    return <MetaChip>{typeLabel(defs, textValue(value), uiLanguage)}</MetaChip>
  }
  if (kindType === 'file_ref' || kindType === 'object_ref') {
    const id = textValue(value)
    if (!id) return ''
    return <MetaChip>{kindType === 'file_ref' ? `${copy.file} ${id.slice(0, 8)}` : id.slice(0, 8)}</MetaChip>
  }
  if (kindType === 'date') {
    const text = textValue(value)
    return text ? <MetaChip>{text}</MetaChip> : ''
  }
  if (kindType === 'boolean') return <MetaChip>{value === true ? copy.yes : copy.no}</MetaChip>
  return textValue(value, uiLanguage)
}

export function JobHistory({ view }: { view: PanesView }) {
  const types = useQuery({
    queryKey: ['job-types'],
    queryFn: () => api.get('/v1/job-types'),
  })
  const [key, setKey] = useState(String(view.state.type ?? ''))
  useEffect(() => {
    const first = types.data?.job_types[0]?.key
    if (!key && first) setKey(String(first))
  }, [types.data, key])
  const runs = useQuery({
    queryKey: ['jobs', key],
    queryFn: () => api.get('/v1/job-types/{key}/runs', { params: { path: { key: key } } }),
    enabled: Boolean(key),
  })
  const runRows = runs.data?.runs ?? []
  return (
    <div data-testid="jobs">
      <div className="toolbar">
        {(types.data?.job_types ?? []).map((item) => (
          <Button key={String(item.key)} variant={item.key === key ? 'primary' : 'default'} onClick={() => setKey(String(item.key))}>
            {jobTypeDisplayTitle(String(item.title))}
          </Button>
        ))}
      </div>
      {runs.isError ? (
        <StateNote tone="error" title={copy.jobsError} detail={(runs.error as Error).message} testId="jobs-error" />
      ) : runs.isPending ? (
        <StateNote tone="loading" title={copy.loading} testId="jobs-loading" />
      ) : runRows.length === 0 ? (
        <StateNote tone="empty" title={copy.noRuns} testId="jobs-empty" />
      ) : null}
      {!runs.isError && !runs.isPending ? runRows.map((row) => (
        <article key={String(row.id)}>
          <MetaChip tone={statusTone(String(row.status))}>{String(row.status)}</MetaChip> {String(row.progress_done ?? '')}/{String(row.progress_total ?? '')} {String(row.log ?? '')}
        </article>
      )) : null}
    </div>
  )
}

export function ProposalView({ session }: { session: PanesSession }) {
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.get('/v1/proposals'),
  })
  const proposal = useQuery({
    queryKey: ['proposal', session.proposalId],
    queryFn: () => api.get('/v1/proposals/{id}', { params: { path: { id: session.proposalId ?? '' } } }),
    enabled: Boolean(session.proposalId),
  })
  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const [dropped, setDropped] = useState<string[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    setError('')
  }, [session.proposalId])
  useEffect(() => {
    setDropped([])
  }, [session.proposalId])
  useEffect(() => {
    if (session.proposalId) return
    const rows = (list.data?.proposals as Json[] | undefined) ?? []
    const first = rows.find((row) => row.status === 'open') ?? rows[0]
    if (first) session.setProposalId(String(first.id))
  }, [list.data, session])
  const rows = (proposal.data?.rows as Json[]) ?? []
  const objectRows = rows.filter((row) => row.object_id && row.type_key !== 'model' && row.type_key !== 'assortment')
  const loaded = useQueries({
    queries: objectRows.map((row) => ({
      queryKey: ['object', String(row.object_id)],
      queryFn: () => api.get('/v1/objects/{id}', { params: { path: { id: String(row.object_id) } } }),
    })),
  })
  const objects = new Map(objectRows.map((row, index) => [String(row.object_id), loaded[index]?.data]))
  const loadingObjects = loaded.some((query) => query.isLoading)
  const accept = useMutation({
    mutationFn: (body: { rows: string[]; patches: Record<string, Json> }) =>
      api.post('/v1/proposals/{id}/accept', { params: { path: { id: session.proposalId ?? '' } }, body: body }),
    onSuccess: (result) => {
      const failed = failureLines(result)
      session.push(failed.length > 0 ? String(failed[0]?.detail ?? copy.validation) : copy.saved)
      setDropped([])
      setError('')
      void queryClient.invalidateQueries({ queryKey: ['proposals'] })
      void queryClient.invalidateQueries({ queryKey: ['proposal'] })
      void queryClient.invalidateQueries({ queryKey: ['object'] })
      void queryClient.invalidateQueries({ queryKey: ['objects'] })
            void queryClient.invalidateQueries({ queryKey: ['path-values'] })
    },
    onError: (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : copy.validation
      setError(message)
      session.push(message)
      void queryClient.invalidateQueries({ queryKey: ['proposals'] })
      void queryClient.invalidateQueries({ queryKey: ['proposal'] })
    },
  })
  const discard = useMutation({
    mutationFn: () => api.post('/v1/proposals/{id}/discard', { params: { path: { id: session.proposalId ?? '' } } }),
    onSuccess: () => {
      session.push(copy.discard)
      setError('')
      session.setProposalId(null)
      void queryClient.invalidateQueries({ queryKey: ['proposals'] })
    },
    onError: (reason: unknown) => {
      const message = reason instanceof Error ? reason.message : copy.validation
      setError(message)
      session.push(message)
      void queryClient.invalidateQueries({ queryKey: ['proposals'] })
      void queryClient.invalidateQueries({ queryKey: ['proposal'] })
    },
  })
  if (!session.proposalId) {
    return (
      <div data-testid="proposal">
        <p className="muted">{(list.data?.proposals as Json[] | undefined)?.length ? 'Select a proposal in the Proposals list.' : 'No proposals yet.'}</p>
      </div>
    )
  }
  if (proposal.data?.session_id) {
    return (
      <div data-testid="proposal">
        <ImportWorkspace
          sessionId={String(proposal.data.session_id)}
          onChanged={() => {
            session.push(copy.saved)
            void queryClient.invalidateQueries({ queryKey: ['proposals'] })
            void queryClient.invalidateQueries({ queryKey: ['proposal'] })
            void queryClient.invalidateQueries({ queryKey: ['objects'] })
          }}
          onGone={() => {
            session.setProposalId(null)
            void queryClient.invalidateQueries({ queryKey: ['proposals'] })
          }}
        />
      </div>
    )
  }
  const consequence = ((proposal.data?.consequence as Json | undefined)?.lines as unknown[] | undefined)?.map(String) ?? []
  const proposalStale = Boolean(proposal.data?.stale)
  const hasPendingRows = rows.some((row) => row.status === 'pending')
  const proposalLoading = proposal.isPending
  const droppedIds = new Set(dropped)
  const saveAll = () => {
    accept.mutate(acceptSelection(rows, objects, defs.data, droppedIds))
  }
  return (
    <div data-testid="proposal">
      <div className="toolbar">
        <strong>{String(proposal.data?.title ?? '')}</strong>
        {proposal.data ? <span className="meta-chip neutral" data-testid="source-badge">{sourceLabel(proposal.data)}</span> : null}
        {proposal.data?.status ? <MetaChip tone={statusTone(String(proposal.data.status))}>{String(proposal.data.status)}</MetaChip> : null}
        {proposalStale ? <span className="meta-chip" data-testid="proposal-stale">{copy.proposalStale}</span> : null}
        <ProposalBulkActions
          status={proposal.data?.status}
          rows={rows}
          loading={proposalLoading}
          saveDisabled={loadingObjects || accept.isPending || discard.isPending || proposalStale || !hasPendingRows}
          discardDisabled={accept.isPending || discard.isPending || !hasPendingRows}
          onSave={saveAll}
          onDiscard={() => discard.mutate()}
        />
        {error ? <p className="error" data-testid="proposal-error">{error}</p> : null}
        {consequence.length > 0 && session.proposalId ? (
          <Button type="button" variant="default" onClick={() => publishProposal(session.proposalId ?? '')}>{copy.reviewChange}</Button>
        ) : null}
      </div>
      {consequence.length > 0 ? (
        <ul className="proposal-tree" data-testid="proposal-tree">
          {consequence.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {rows.map((row) => (
        <SuggestionCard
          key={String(row.id)}
          row={row}
          current={(objects.get(String(row.object_id))?.values as Json | undefined) ?? {}}
          defs={defs.data}
          dropped={droppedIds}
          onToggle={(lineId) =>
            setDropped((current) =>
              current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId],
            )
          }
        />
      ))}
    </div>
  )
}

type ProposalRow = { id: string; title: string; source: string; status: string; changes: string; by: string; created: string }

/** Every proposal in the standard table. Picking a row opens it in the Proposal view. */
export function ProposalListView({ session }: { session: PanesSession }) {
  const [filter, setFilter] = useState('')
  const list = useQuery({ queryKey: ['proposals'], queryFn: () => api.get('/v1/proposals') })
  const rows: ProposalRow[] = ((list.data?.proposals as Json[] | undefined) ?? []).map((row) => {
    const counters = row.counters as Json | undefined
    return {
      id: String(row.id),
      title: String(row.title),
      source: sourceLabel(row),
      status: String(row.status),
      changes: counters
        ? `${Number(counters.new ?? 0)} new, ${Number(counters.changed ?? 0)} changed, ${Number(counters.failed ?? 0)} errors`
        : row.row_count != null ? `${Number(row.row_count)} rows` : '',
      by: String(row.actor_name ?? ''),
      created: row.created_at ? relativeTime(String(row.created_at)) : '',
    }
  })
  const columns: Array<StandardColumn<ProposalRow>> = [
    { id: 'title', header: 'Proposal', type: 'readonly', truncate: true, read: (row) => row.title },
    { id: 'source', header: 'Source', type: 'readonly', truncate: true, width: 90, read: (row) => row.source },
    {
      id: 'status',
      header: 'Status',
      type: 'readonly',
      width: 90,
      read: (row) => row.status,
      display: (row) => <MetaChip tone={statusTone(row.status)}>{row.status}</MetaChip>,
    },
    { id: 'changes', header: 'Changes', type: 'readonly', truncate: true, width: 190, read: (row) => row.changes },
    { id: 'by', header: 'By', type: 'readonly', truncate: true, width: 110, read: (row) => row.by },
    { id: 'created', header: 'Created', type: 'readonly', truncate: true, width: 110, read: (row) => row.created },
  ]
  return (
    <StandardEditableTable
      testId="proposal-list"
      columns={columns}
      rows={rows}
      editable={false}
      loading={list.isPending}
      emptyLabel="No proposals yet."
      filterValue={filter}
      onFilterChange={setFilter}
      activeRowId={session.proposalId}
      onActivateRow={(row) => session.setProposalId(row.id)}
      getRowTestId={(row) => `proposal-row-${row.id}`}
    />
  )
}
const MODEL_OP_LABELS: Record<string, string> = {
  upsert_catalog: 'Catalog',
  delete_catalog: 'Catalog',
  upsert_merge_profile: 'Merge profile',
  delete_merge_profile: 'Merge profile',
  set_ownership_rules: 'Ownership',
}

function modelOpLabel(op: string) {
  return MODEL_OP_LABELS[op] ?? op
}

function SuggestionCard({
  row,
  current,
  defs,
  dropped,
  onToggle,
}: {
  row: Json
  current: Json
  defs: Json | undefined
  dropped: Set<string>
  onToggle: (lineId: string) => void
}) {
  const model = row.type_key === 'model' || row.type_key === 'assortment'
  const lines = model ? [] : suggestionLines(current, row.patch, defs)
  const pending = row.status === 'pending'
  return (
    <article className="suggestion-card" data-testid="suggestion-card">
      <h3>
        {model ? <MetaChip>{modelOpLabel(String((row.patch as Json | undefined)?.op ?? row.type_key ?? 'model'))}</MetaChip> : String(row.object_key ?? row.object_id)}
        {' '}
        <MetaChip tone={statusTone(String(row.status))}>{String(row.status)}</MetaChip>
        {row.conflict ? ` · ${copy.conflict}` : ''}
      </h3>
      {lines.map((line) => {
        const id = `${String(row.id)}:${line.id}`
        const rejected = dropped.has(id)
        return (
          <div key={id} className="suggestion-field" data-testid="suggestion-field" data-line={line.id}>
            <FieldDiff lines={[line]} />
            {pending ? (
              <>
                <Button type="button" variant="default" data-testid="accept-field" aria-pressed={!rejected} onClick={() => (rejected ? onToggle(id) : undefined)}>{copy.acceptField}</Button>
                <Button type="button" variant="default" data-testid="reject-field" aria-pressed={rejected} onClick={() => (rejected ? undefined : onToggle(id))}>{copy.rejectField}</Button>
              </>
            ) : null}
          </div>
        )
      })}
    </article>
  )
}

function acceptSelection(
  rows: Json[],
  objects: Map<string, Json | undefined>,
  defs: Json | undefined,
  dropped: Set<string>,
): { rows: string[]; patches: Record<string, Json> } {
  const ids: string[] = []
  const patches: Record<string, Json> = {}
  for (const row of rows) {
    if (row.status !== 'pending') continue
    const id = String(row.id)
    ids.push(id)
    if (row.type_key === 'model' || row.type_key === 'assortment') continue
    const current = (objects.get(String(row.object_id))?.values as Json | undefined) ?? {}
    const lines = suggestionLines(current, row.patch, defs)
    if (lines.length === 0) continue
    const kept = lines.filter((line) => !dropped.has(`${id}:${line.id}`))
    if (kept.length === lines.length) continue
    patches[id] = kept.length === 0 ? { values: {} } : { values: valuesFromKept(current, proposedValues(row.patch), lines, kept) }
  }
  return { rows: ids, patches }
}

function suggestionIndex(body: Json | undefined): Map<string, number> {
  const pending = (body?.pending as Json | undefined) ?? {}
  const objects = (pending.objects as Json[] | undefined) ?? []
  return new Map(objects.map((row) => [String(row.object_id), Number(row.count ?? 0)]))
}
