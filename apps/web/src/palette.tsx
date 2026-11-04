import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent , useLayoutEffect, useRef} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { MetaChip, type ChipTone } from './chips'
import { toast } from 'sonner'
import { ApiError, api, operationId, textValue, type Json } from './api'
import { reportWriteError } from './write-error'
import { streamAgent, type AgentEvent } from './agent-stream'
import { renderAgentAnswer } from './agent-answer'
import { Button } from './components/ui/button'
import { Command, CommandInput, CommandItem, CommandList } from './components/ui/command'
import { Kbd } from './components/ui/kbd'
import { dynamicSelectionFilter, emitSavedSelection, requestDeleteSelection, requestEditSelection, requestNewSelection, selectionMatchesType } from './assortment-filter'
import { workspaceDisplayName } from './demo-labels'
import { sourceLabel, suggestedTitle } from './field-diff'
import { copy, uiLanguage } from './i18n'
import { structureCaption } from './graph-scene'
import { chordForCommand } from './shortcuts'
import { mergeFrecency, readFrecency, touch, writeFrecency } from './frecency'
import { withModelCommand } from './model-command'
import { activeAfterQuery, filterPaletteRows, frecencyId, readPaletteMemory, rememberPaletteItem, selectedObjectId, visibleRows, withRecent, groupTitle, type PaletteGroup, type PaletteItem } from './palette-model'
import { argumentBreadcrumb, isObjectParam, objectTypeFilter, paletteKeyEffect, placeTargetId, tabHint, type PaletteFrame } from './palette-core'
import { argumentCommands, type OperationRecord } from './palette-operations'
import { objectPaletteRows } from './palette-objects'
import { viewPaletteRows } from './palette-views'
import { workspacePaletteRows } from './palette-workspaces'
import { addViewRootItem, addViewSubmenuRows, isAddViewRoot, parseAddViewChoice } from './palette-add-view'
import {
  isSelectSourceRoot,
  parseSelectSourceChoice,
  selectSourceRootItem,
  selectSourceSubmenuRows,
  type PeerSourceOption,
} from './palette-select-source'
import {
  createWorkspaceFromSavedTemplate,
  isNewFromTemplateRoot,
  newFromTemplateRootItem,
  newFromTemplateSubmenuRows,
  parseSavedTemplateChoice,
  useSavedWorkspaceTemplatesQuery,
} from './palette-new-from-template'
import {
  isSwitchCatalogRoot,
  parseSwitchCatalogChoice,
  switchCatalogEventDetail,
  switchCatalogRootItem,
  switchCatalogSubmenuRows,
} from './palette-switch-catalog'
import { useCatalogsQuery } from './catalog-list'
import { MASTER_CATALOG_ID } from './catalog-ref'
import { publishProposal } from './proposal-bus'
import { modelFocus, openModelDialog, requestDiscardDraft, requestReview, stageModel } from './model-stage'
import { isStandardAttribute, queueViewType, requestAttributeAction } from './attribute-actions'
import { stepText } from './steps'
import { createWorkspaceFromTemplate, workspaceTemplates } from './templates'
import {
  commandPlaceholder,
  displayViewTitle,
  searchGroupTitle,
  typeNames,
  typeOfView,
  typeViewPaletteItems,
} from './type-labels'
import { linkedTypeLinks, peerSourceOf } from './view-source'
import { applyUiResult, dispatchUi, uiOperations } from './ui-bus'
import {
  readSelection,
  readTreeNode,
  readUiContext,
  subscribeUiSelections,
  uiSelectionVersion,
  type UiColumn,
} from './ui-context'
import { runCommand } from './command-registry'
import { registryPaletteCommandIds, registryPaletteRows } from './palette-registry-rows'
import { FieldsMode, type FieldsPaletteOpen } from './fields/fields-mode'
import { readFieldsHost, subscribeFieldsHost } from './fields-host'
import { makeViewColumn, parseColumnId } from './fields/columns'

type SessionLike = {
  objectId: string | null
  listType?: string | null
  workspaceType?: string | null
  group?: string | null
  setObjectId: (value: string | null) => void
  setProposalId: (value: string | null) => void
  push: (line: string) => void
  openWorkspace: (id: string) => void
  openTypeView?: (typeId: string) => void
}

type Turn = { role: 'user' | 'assistant'; text: string }
type Step = { id: string; text: string; state: 'run' | 'done' }
type ProposalPreview = {
  id: string
  title: string
  rows: Json[]
  lines: string[]
  source?: string
  actor_name?: unknown
  behalf_name?: unknown
  error?: string
}


/** True when the key event targets the palette query field (caret / selection). */
function isPaletteQueryInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('[data-testid="palette-input"], [cmdk-input]')
}

export function CommandPalette({
  session,
  workspaces,
  views,
  ai,
  feedbackEnabled,
  onSendFeedback,
  theme = 'dark',
  onSignOut,
  focusViewId,
  onPrepareAddView,
  startAddView,
  startSelectSource,
  startNewFromTemplate,
  startSwitchCatalog,
  workspaceCatalogId,
  onSelectSourceType,
  onSelectSourcePeer,
  onClose,
  fieldsMode,
  fieldsEditColumnId,
  onFieldsConsumed,
  workspaceReady = true,
}: {
  session: SessionLike
  workspaces: Array<{ id: string; name: string; share_token?: string | null }>
  views: Array<{ id: string; title: string; type: string; state?: Json }>
  ai?: boolean
  feedbackEnabled?: boolean
  onSendFeedback?: () => void
  theme?: 'dark' | 'light'
  onSignOut?: () => void
  focusViewId?: string | null
  onPrepareAddView?: () => void
  startAddView?: boolean
  startSelectSource?: boolean
  startNewFromTemplate?: boolean
  startSwitchCatalog?: boolean
  workspaceCatalogId?: string
  onSelectSourceType?: (typeId: string) => void
  onSelectSourcePeer?: (viewId: string, linkType?: string) => void
  onClose: () => void
  fieldsMode?: boolean
  fieldsEditColumnId?: string | null
  onFieldsConsumed?: () => void
  /** False while the workspace document is not painted. Layout commands stay open and say so. */
  workspaceReady?: boolean
}) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'list' | 'ai' | 'fields'>(fieldsMode || ai ? (fieldsMode ? 'fields' : 'ai') : 'list')
  const inputRef = useRef<HTMLInputElement>(null)
  // Focus before paint so the first key after Ctrl+K is not lost to a microtask race.
  useLayoutEffect(() => {
    if (mode === 'fields') return
    inputRef.current?.focus()
  }, [mode])
  const [fieldsHost, setFieldsHost] = useState(() => readFieldsHost())
  useEffect(() => subscribeFieldsHost(() => setFieldsHost(readFieldsHost())), [])
  useEffect(() => {
    if (fieldsMode) setMode('fields')
  }, [fieldsMode])
  useEffect(() => {
    if (mode === 'fields' && fieldsEditColumnId) onFieldsConsumed?.()
  }, [mode, fieldsEditColumnId, onFieldsConsumed])
  const [active, setActive] = useState<number | null>(null)
  const [stack, setStack] = useState<PaletteFrame[]>([])
  // Drilling a sub-list replaces the rows under the cursor. Keep the query field
  // focused so Backspace and Esc still reach the palette.
  useLayoutEffect(() => {
    if (mode === 'fields') return
    inputRef.current?.focus()
  }, [stack.length, mode])
  const [turns, setTurns] = useState<Turn[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [answer, setAnswer] = useState('')
  const [running, setRunning] = useState(false)
  const [proposal, setProposal] = useState<ProposalPreview | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  useEffect(() => {
    if (!query.trim()) {
      setDebouncedQuery('')
      return
    }
    const timer = window.setTimeout(() => setDebouncedQuery(query), 120)
    return () => window.clearTimeout(timer)
  }, [query])
  const topFrame = stack.at(-1)
  const objectParam = isObjectParam(topFrame?.paramType) ? topFrame?.paramType : undefined
  const searchFilter = objectTypeFilter(objectParam)
  const found = useQuery({
    queryKey: ['palette', debouncedQuery, searchFilter ?? ''],
    queryFn: ({ signal }) =>
      api.get('/v1/search', {
        params: {
          query: {
            q: debouncedQuery,
            per_page: objectParam ? 20 : 8,
            lang: uiLanguage,
            ...(searchFilter ? { filter: searchFilter } : {}),
          },
        },
        signal,
      }),
    enabled: mode === 'list' && (Boolean(objectParam) || (debouncedQuery.trim().length > 0 && stack.length === 0)),
  })
  const operations = useQuery({
    queryKey: ['operations'],
    queryFn: () => api.get('/v1/operations'),
    staleTime: 60_000,
  })
  const remoteFrecency = useQuery({
    queryKey: ['frecency'],
    queryFn: () => api.get('/v1/frecency'),
    staleTime: 30_000,
  })
  const [frecencyTick, setFrecencyTick] = useState(0)
  useEffect(() => {
    const entries = remoteFrecency.data?.entries
    if (!entries) return
    writeFrecency(mergeFrecency(readFrecency(), entries))
    setFrecencyTick((value) => value + 1)
  }, [remoteFrecency.data])
  const frecency = useMemo(() => readFrecency(), [query, turns.length, frecencyTick])
  const paletteMemory = useMemo(() => readPaletteMemory(), [query, turns.length, frecencyTick])

  const defs = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions'), staleTime: 60_000 })
  const workspaceType = session.workspaceType || session.listType || ''
  const selections = useQuery({
    queryKey: ['assortments', workspaceType],
    queryFn: () => api.get('/v1/assortments', { params: { query: { type: workspaceType } } }),
    enabled: Boolean(workspaceType),
  })
  const selectedObject = useQuery({
    queryKey: ['object', session.objectId],
    queryFn: () => api.get('/v1/objects/{id}', { params: { path: { id: session.objectId ?? '' } } }),
    enabled: Boolean(session.objectId),
    staleTime: 30_000,
  })
  const types = useMemo(() => typeNames(defs.data, uiLanguage), [defs.data])
  const workspaceTypeId = types.find((type) => type.key === workspaceType)?.id ?? ''
  const selectionItems = ((selections.data?.assortments ?? []) as Json[]).filter((item) =>
    selectionMatchesType(item, workspaceType, workspaceTypeId),
  )
  const suggestions = useQuery({
    queryKey: ['proposals'],
    queryFn: () => api.get('/v1/proposals'),
  })
  const savedTemplates = useSavedWorkspaceTemplatesQuery()
  const savedTemplateList = useMemo(() => savedTemplates.data ?? [], [savedTemplates.data])
  const suggestionTotal = Number(((suggestions.data?.pending as Json | undefined)?.total) ?? 0)
  const selectedKey = String(selectedObject.data?.type ?? '')
  // Live selections in other views become peer sources (Notion 103 PR 2).
  const selectionVersion = useSyncExternalStore(subscribeUiSelections, uiSelectionVersion, uiSelectionVersion)
  const peerSourceByView = useMemo(() => {
    const next = new Map<string, string>()
    for (const view of views) {
      const peer = peerSourceOf(view.state)
      if (peer) next.set(view.id, peer.viewId)
    }
    return next
  }, [views])
  const peerSourceOptions = useMemo<PeerSourceOption[]>(() => {
    const options: PeerSourceOption[] = []
    for (const sourceView of views) {
      const viewTitle = displayViewTitle(sourceView, types, selectedKey)
      if (sourceView.type === 'structure_tree') {
        const node = readTreeNode(sourceView.id)
        if (!node) continue
        const typeIds = types
          .filter((type) => {
            if (type.kind === 'link') return false
            if (type.structures === undefined) return true
            return type.structures.includes(node.structureId) || type.structures.includes(node.structureKey)
          })
          .map((type) => type.id)
        if (typeIds.length === 0) continue
        options.push({
          viewId: sourceView.id,
          viewTitle,
          selection: 'node',
          label: structureCaption(node.groupKey, defs.data, node.structureKey),
          typeIds,
        })
      }
      if (sourceView.type === 'object_table') {
        const bound = typeOfView(sourceView, types)
        if (!bound || !bound.id || bound.kind === 'link') continue
        // Ignore the table's global marked-object fallback: a source row must
        // belong to the view's own type.
        const rows = readSelection(sourceView.id).filter((row) =>
          !row.type || row.type === bound.id || row.type === bound.key,
        )
        // A view that already follows a peer source stays choosable even before
        // it has a selected row, so chains A -> B -> C can be built in order.
        // The target itself stays visible so a self-source can be shown disabled.
        if (rows.length === 0 && !peerSourceByView.has(sourceView.id) && sourceView.id !== focusViewId) continue
        const links = linkedTypeLinks(bound.id, defs.data)
        if (links.length === 0) continue
        const typeIds = [...new Set(links.map((link) => link.typeId))]
        options.push({
          viewId: sourceView.id,
          viewTitle,
          selection: 'row',
          label: rows.map((row) => row.key || row.name || row.id).filter(Boolean).slice(0, 3).join(', '),
          typeIds,
          links,
        })
      }
    }
    return options
    // selectionVersion re-reads the live registry; the other inputs shape the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, types, defs.data, focusViewId, selectedKey, selectionVersion, peerSourceByView])
  const sourceTarget = useMemo(() => {
    const focused = views.find((view) => view.id === focusViewId && view.type === 'object_table')
    return focused ?? views.find((view) => view.type === 'object_table')
  }, [views, focusViewId])
  const currentSource = useMemo(() => {
    if (!sourceTarget) return null
    const bound = typeOfView(sourceTarget, types)
    const peer = peerSourceOf(sourceTarget.state)
    return peer
      ? { typeId: bound?.id ?? '', peerViewId: peer.viewId, selection: peer.selection, linkType: peer.linkType }
      : { typeId: bound?.id ?? '' }
  }, [sourceTarget, types])
  const sourceCycle = useMemo(() => {
    if (!sourceTarget) return undefined
    return {
      targetViewId: sourceTarget.id,
      sourceOf: (viewId: string) => peerSourceByView.get(viewId),
    }
  }, [sourceTarget, peerSourceByView])
  // Columns of the open table, read once when the palette opens.
  const tableColumns = useMemo(() => readUiContext().columns, [])
  const catalogsList = useCatalogsQuery()
  const catalogOptions = (catalogsList.data ?? []).map((row) => ({
    id: row.id || MASTER_CATALOG_ID,
    key: row.key || 'master',
    name: row.name || row.key || 'master',
    kind: row.kind,
  }))
  const currentCatalogName = catalogOptions.find((row) => row.id === (workspaceCatalogId || MASTER_CATALOG_ID))?.name
  const operationRecords = useMemo(
    () => (operations.data?.operations ?? []) as OperationRecord[],
    [operations.data],
  )
  const catalog = useMemo(
    () => [
      ...argumentCommands(operationRecords, types),
      ...buildCatalog(workspaces, views, types, selectedKey, suggestionTotal, feedbackEnabled, theme, focusViewId),
      switchCatalogRootItem(currentCatalogName),
      {
        id: 'selections',
        group: 'views' as const,
        title: `${copy.assortments} ›`,
        subtitle: 'Saved selections for this type',
        keywords: ['assortment', 'selection'],
      },
      {
        id: 'selection:new',
        group: 'views' as const,
        title: copy.newSelection,
        subtitle: copy.assortments,
        keywords: ['assortment', 'selection'],
      },
      {
        id: 'selection:save-filter',
        group: 'views' as const,
        title: copy.saveFilterAsSelection,
        subtitle: copy.saveFilterAsSelectionHint,
        keywords: ['assortment', 'selection', 'filter', 'save', 'dynamic'],
      },
      {
        id: 'selection:edit',
        group: 'views' as const,
        title: copy.editSelection,
        subtitle: copy.assortments,
        keywords: ['assortment', 'selection', 'edit', 'rename', 'filter'],
      },
      {
        id: 'selection:delete',
        group: 'views' as const,
        title: copy.deleteSelection,
        subtitle: copy.assortments,
        keywords: ['assortment', 'selection', 'delete', 'remove'],
      },
      ...columnEntries(tableColumns, readUiContext().activeColumn),
      ...(session.group
        ? [{
            id: 'model:delete-group',
            group: 'model' as const,
            title: copy.deleteMenu,
            subtitle: 'Delete the selected structure group',
            keywords: ['delete', 'remove', 'group'],
          }]
        : []),
      { id: 'model:new-type', group: 'model' as const, title: copy.newType, subtitle: copy.dataModel, keywords: ['create', 'type'] },
      { id: 'model:new-link-type', group: 'model' as const, title: copy.newLinkType, subtitle: copy.dataModel, keywords: ['create', 'link', 'type'] },
      { id: 'link:to', group: 'views' as const, title: `${copy.linkTo} ›`, subtitle: copy.addLink, keywords: ['link', 'relation'] },
      { id: 'link:add', group: 'views' as const, title: copy.addLink, subtitle: copy.linkTypes, keywords: ['link', 'add'] },
      { id: 'link:remove', group: 'views' as const, title: copy.removeLink, subtitle: copy.linkTypes, keywords: ['link', 'remove'] },
      { id: 'model:delete-link-type', group: 'model' as const, title: copy.deleteLinkType, subtitle: copy.dataModel, keywords: ['delete', 'link', 'type'] },
      { id: 'model:new-list', group: 'model' as const, title: copy.newValueList, subtitle: copy.dataModel, keywords: ['create', 'list', 'option'] },
      { id: 'model:new-family', group: 'model' as const, title: copy.newUnitFamily, subtitle: copy.dataModel, keywords: ['create', 'unit'] },
      { id: 'model:new-tree', group: 'model' as const, title: copy.newTree, subtitle: copy.dataModel, keywords: ['create', 'structure', 'tree'] },
      { id: 'model:review', group: 'model' as const, title: copy.reviewAndSave, subtitle: copy.dataModel, keywords: ['draft', 'save'], kbd: 'Ctrl+S' },
      { id: 'model:discard', group: 'model' as const, title: copy.discardDraft, subtitle: copy.dataModel, keywords: ['draft'] },
      { id: 'model:undo', group: 'model' as const, title: copy.undoModel, subtitle: copy.dataModel, keywords: ['undo'] },
      { id: 'model:delete-type', group: 'model' as const, title: copy.deleteType, subtitle: copy.dataModel, keywords: ['delete', 'type'] },
      ...(focusedStandard(defs.data)
        ? []
        : [{ id: 'model:delete-attribute', group: 'model' as const, title: copy.deleteAttribute, subtitle: copy.dataModel, keywords: ['delete', 'attribute'] }]),
      { id: 'model:delete-structure', group: 'model' as const, title: copy.deleteStructure, subtitle: copy.dataModel, keywords: ['delete', 'structure', 'tree'] },
      { id: 'model:delete-list', group: 'model' as const, title: copy.deleteValueList, subtitle: copy.dataModel, keywords: ['delete', 'list'] },
      { id: 'model:delete-option', group: 'model' as const, title: copy.deleteOption, subtitle: copy.dataModel, keywords: ['delete', 'option'] },
      { id: 'model:delete-family', group: 'model' as const, title: copy.deleteUnitFamily, subtitle: copy.dataModel, keywords: ['delete', 'unit'] },
      { id: 'model:delete-unit', group: 'model' as const, title: copy.deleteUnit, subtitle: copy.dataModel, keywords: ['delete', 'unit'] },
      { id: 'attr:add-type', group: 'model' as const, title: copy.addToType, subtitle: copy.attributeDefinitions, keywords: ['attribute', 'type', 'attach'] },
      { id: 'attr:add-group', group: 'model' as const, title: copy.addToGroup, subtitle: copy.attributeDefinitions, keywords: ['attribute', 'group', 'attach'] },
      { id: 'attr:rename', group: 'model' as const, title: copy.renameAttribute, subtitle: copy.attributeDefinitions, keywords: ['attribute', 'label', 'rename'] },
      ...(focusedStandard(defs.data)
        ? []
        : [
            { id: 'attr:rename-key', group: 'model' as const, title: copy.renameKey, subtitle: copy.attributeDefinitions, keywords: ['attribute', 'key', 'rename'] },
            { id: 'attr:delete', group: 'model' as const, title: copy.deleteMenu, subtitle: copy.attributeDefinitions, keywords: ['attribute', 'delete'] },
          ]),
      { id: 'attr:new', group: 'model' as const, title: copy.newAttribute, subtitle: copy.attributeDefinitions, keywords: ['attribute', 'create'] },
    ],
    [workspaces, views, session.group, types, selectedKey, suggestionTotal, feedbackEnabled, theme, tableColumns, defs.data, operationRecords],
  )
  const hits: PaletteItem[] = objectPaletteRows((found.data?.hits as Json[] | undefined) ?? [], defs.data)
  useEffect(() => {
    if (!startAddView) return
    onPrepareAddView?.()
    setStack([{
      label: `${copy.addView} ›`,
      rows: addViewSubmenuRows(views, types, selectedKey),
    }])
    setActive(0)
    // Mount-only: right-click Add view opens the submenu immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAddView])
  useEffect(() => {
    if (!startNewFromTemplate) return
    setStack([{
      label: `${copy.newWorkspace} ›`,
      rows: newFromTemplateSubmenuRows(types, workspaces, savedTemplateList),
    }])
    setActive(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startNewFromTemplate, savedTemplateList])
  useEffect(() => {
    setStack((current) => {
      const top = current.at(-1)
      if (!top || top.label !== `${copy.newWorkspace} ›`) return current
      return [...current.slice(0, -1), {
        ...top,
        rows: newFromTemplateSubmenuRows(types, workspaces, savedTemplateList),
      }]
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedTemplateList])

  useEffect(() => {
    if (!startSelectSource) return
    setStack([{
      label: `${copy.dataSource} ›`,
      rows: selectSourceSubmenuRows(types, peerSourceOptions, currentSource, sourceCycle),
    }])
    setActive(0)
    // Mount-only: dock menu Select source opens the submenu immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSelectSource])

  useEffect(() => {
    if (!startSwitchCatalog) return
    setStack([{
      label: `${copy.switchCatalog} ›`,
      rows: switchCatalogSubmenuRows(catalogOptions),
    }])
    setActive(0)
    // Re-run when catalogs finish loading so the submenu is not stuck on the
    // master-only fallback from the first paint.
  }, [startSwitchCatalog, catalogOptions])

  const rootRows = withModelCommand(query, visibleRows(query, catalog, stack.length === 0 ? hits : [], frecency, Date.now(), paletteMemory))
  const frameRows = topFrame
    ? filterPaletteRows(isObjectParam(topFrame.paramType) ? hits : topFrame.rows, query)
    : undefined
  const frameExtras = topFrame && isObjectParam(topFrame.paramType)
    ? paletteMemory.filter((item) => topFrame.paramType === 'object' || item.typeKey === topFrame.paramType)
    : []
  const rows = frameRows ? withRecent(frameRows, frecency, Date.now(), query, frameExtras) : rootRows
  const activeRow = active == null ? undefined : rows[active]
  const bestKey = rows.find((row) => row.group === 'best')?.id ?? ''

  useEffect(() => {
    if (mode !== 'list' || stack.length > 0) return
    const next = activeAfterQuery(rows, query)
    if (next != null) setActive(next)
  }, [query, mode, stack.length, bestKey])
  useEffect(() => {
    if (mode !== 'list' || stack.length === 0 || !query.trim()) return
    setActive(0)
  }, [query, mode, stack.length])
  useEffect(() => {
    document.querySelector<HTMLElement>('#palette-list .hit.on')?.scrollIntoView({ block: 'nearest' })
  }, [active, rows.length])

  const needsWorkspace = (commandId: string) =>
    commandId.startsWith('view:')
    || commandId.startsWith('layout:')
    || commandId.startsWith('place:')
    || commandId.startsWith('right:')
    || commandId === 'object:open'
    || commandId === 'object:right'
    || commandId === 'object:history'
    || commandId === 'object:graph'

  const blockUntilWorkspace = (commandId: string) => {
    if (workspaceReady || !needsWorkspace(commandId)) return false
    toast.message(copy.workspaceOpeningWhenReady)
    return true
  }

  const run = (item: PaletteItem) => {
    if (item.disabled) return
    const id = item.sourceId ?? item.id
    if (item.id.startsWith('right:') && item.sourceId) {
      if (blockUntilWorkspace(item.id)) return
      dispatchUi('ui.place', { id: placeTargetId(item.sourceId), zone: 'right' })
      onClose()
      return
    }
    if (item.id.startsWith('place:')) {
      if (blockUntilWorkspace(item.id)) return
      const zone = item.id.split(':').at(-1) ?? 'right'
      dispatchUi('ui.place', { id: placeTargetId(item.sourceId ?? ''), zone })
      onClose()
      return
    }
    if (item.id.startsWith('copy:') && item.sourceId) {
      void navigator.clipboard?.writeText(item.sourceId)
      onClose()
      return
    }
    if (item.id.startsWith('open:') && item.sourceId) {
      session.setObjectId(item.sourceId)
      dispatchUi('ui.select', { id: item.sourceId })
      onClose()
      return
    }
    const remembered = frecencyId(item)
    if (remembered !== 'ask' && item.group !== 'ask') {
      touch(remembered)
      rememberPaletteItem(item)
      setFrecencyTick((value) => value + 1)
      void api.post('/v1/frecency', { body: { id: remembered } }).catch((reason: unknown) => {
        reportWriteError(reason)
      })
    }
    if (item.argument) {
      const paramType = item.argument.type
      const rows = paramType === 'view'
        ? viewPaletteRows(views, types, selectedKey)
        : paramType === 'workspace'
          ? workspacePaletteRows(workspaces)
          : []
      setStack((current) => [...current, { label: argumentBreadcrumb(item.title), paramType, rows }])
      setQuery('')
      setActive(0)
      return
    }
    if (isSwitchCatalogRoot(id)) {
      setStack((current) => [...current, {
        label: `${copy.switchCatalog} ›`,
        rows: switchCatalogSubmenuRows(catalogOptions),
      }])
      setQuery('')
      setActive(0)
      return
    }
    {
      const catalogId = parseSwitchCatalogChoice(id)
      if (catalogId) {
        // A focused view gets an override; without focus the picker sets the
        // workspace default (the header picker stays workspace-global).
        window.dispatchEvent(
          new CustomEvent('braian-set-catalog', {
            detail: switchCatalogEventDetail(catalogId, focusViewId),
          }),
        )
        onClose()
        return
      }
    }
    if (isAddViewRoot(id)) {
      onPrepareAddView?.()
      setStack((current) => [...current, {
        label: item.title,
        rows: addViewSubmenuRows(views, types, selectedKey),
      }])
      setQuery('')
      setActive(0)
      return
    }
    if (isNewFromTemplateRoot(id)) {
      setStack((current) => [...current, {
        label: item.title,
        rows: newFromTemplateSubmenuRows(types, workspaces, savedTemplateList),
      }])
      setQuery('')
      setActive(0)
      return
    }
    const addChoice = parseAddViewChoice(id)
    if (addChoice) {
      if (addChoice.kind === 'type') {
        onPrepareAddView?.()
        session.openTypeView?.(addChoice.value)
      } else {
        const target = focusViewId || undefined
        dispatchUi('ui.open_view', {
          id: addChoice.value,
          zone: 'center',
          ...(target ? { target } : {}),
        })
      }
      onClose()
      return
    }

    if (isSelectSourceRoot(id)) {
      setStack((current) => [...current, {
        label: item.title,
        rows: selectSourceSubmenuRows(types, peerSourceOptions, currentSource, sourceCycle),
      }])
      setQuery('')
      setActive(0)
      return
    }
    const sourceChoice = parseSelectSourceChoice(id)
    if (sourceChoice) {
      if ('typeId' in sourceChoice) onSelectSourceType?.(sourceChoice.typeId)
      else onSelectSourcePeer?.(sourceChoice.peerViewId, sourceChoice.linkType)
      onClose()
      return
    }
    if (id === 'filter:by' || id === 'export:columns') {
      const type = session.workspaceType || session.listType || ''
      const mode = id === 'filter:by' ? 'filter' : 'export'
      void api.get('/v1/types/{id}/attribute-paths', { params: { path: { id: type } } })
        .then((body) => {
          setStack((current) => [...current, {
            label: item.title,
            rows: (body.paths ?? []).map((path) => ({
              id: `path:${mode}:${path.text}`,
              sourceId: `path:${mode}:${path.text}`,
              group: 'views' as const,
              title: path.label,
              subtitle: path.text,
            })),
          }])
          setQuery('')
          setActive(0)
        })
        .catch((reason: unknown) => {
          reportWriteError(reason)
        })
      return
    }
    if (id.startsWith('path:filter:')) {
      window.dispatchEvent(new CustomEvent('braian-path-filter', { detail: { text: id.slice('path:filter:'.length), label: item.title } }))
      onClose()
      return
    }
    if (id.startsWith('path:export:')) {
      window.dispatchEvent(new CustomEvent('braian-export-column', { detail: { text: id.slice('path:export:'.length), label: item.title } }))
      onClose()
      return
    }
    if (id === 'columns:hide') {
      setStack((current) => [...current, { label: item.title, rows: columnRows(tableColumns, true) }])
      setQuery('')
      setActive(0)
      return
    }
    if (id === 'fields:select') {
      setMode('fields')
      return
    }
    if (id === 'fields:edit') {
      setMode('fields')
      return
    }
    if (id.startsWith('column:hide:') || id.startsWith('column:show:')) {
      const column = id.slice('column:hide:'.length)
      dispatchUi(id.startsWith('column:hide:') ? 'ui.hide_column' : 'ui.show_column', { column })
      onClose()
      return
    }
    if (id === 'column:move-left' || id === 'column:move-right') {
      const column = readUiContext().activeColumn
      if (column) {
        dispatchUi('ui.move_column', {
          column,
          direction: id === 'column:move-left' ? 'left' : 'right',
        })
      }
      onClose()
      return
    }
    if (id === 'model:new-type' || id === 'model:new-list' || id === 'model:new-family' || id === 'model:new-tree' || id === 'model:new-link-type') {
      const kind = id === 'model:new-type' ? 'type' : id === 'model:new-list' ? 'list' : id === 'model:new-family' ? 'family' : id === 'model:new-link-type' ? 'link' : 'tree'
      openModelDialog(kind)
      onClose()
      return
    }
    if (id === 'link:to') {
      const rows = ((defs.data?.types as Json[]) ?? [])
        .filter((item) => item.kind === 'link')
        .map((item) => ({
          id: `link:type:${String(item.key)}`,
          sourceId: `link:type:${String(item.key)}`,
          group: 'object' as const,
          title: textValue(item.labels, uiLanguage) || textValue(item.singular, uiLanguage) || String(item.key),
          subtitle: copy.linkTo,
        }))
      setStack((current) => [...current, { label: copy.linkTo, rows }])
      setQuery('')
      setActive(0)
      return
    }
    if (id.startsWith('link:type:')) {
      window.dispatchEvent(new CustomEvent('braian-add-link', { detail: { linkType: id.slice('link:type:'.length) } }))
      onClose()
      return
    }
    if (id === 'link:add') {
      window.dispatchEvent(new CustomEvent('braian-add-link', { detail: {} }))
      onClose()
      return
    }
    if (id === 'link:remove') {
      window.dispatchEvent(new Event('braian-remove-link'))
      onClose()
      return
    }
    if (id === 'model:delete-link-type') {
      const target = modelFocus()
      if (target?.kind === 'type') {
        void stageModel('model.delete_link_type', { key: target.key }).catch((reason: unknown) => {
          reportWriteError(reason)
        })
      }
      onClose()
      return
    }
    if (id === 'model:review') {
      requestReview()
      onClose()
      return
    }
    if (id === 'model:discard') {
      requestDiscardDraft()
      onClose()
      return
    }
    if (id === 'model:undo') {
      void api.post('/v1/operations/{name}', { params: { path: { name: "model.undo" } }, body: {} }).catch((reason: unknown) => {
        reportWriteError(reason)
      })
      onClose()
      return
    }
    if (id.startsWith('model:delete-') && id !== 'model:delete-group') {
      const target = modelFocus()
      const runDelete = (name: string, args: Json) => {
        void stageModel(name, args).catch((reason: unknown) => {
          reportWriteError(reason)
        })
      }
      if (id === 'model:delete-type' && target?.kind === 'type') runDelete('model.delete_type', { type: target.key })
      if (id === 'model:delete-attribute' && target?.kind === 'attribute') runDelete('model.delete_attribute', { attribute: target.key })
      if (id === 'model:delete-structure' && target?.kind === 'structure') runDelete('model.delete_structure', { structure: target.key })
      if (id === 'model:delete-list' && target?.kind === 'value_list') runDelete('model.delete_value_list', { value_list: target.key })
      if (id === 'model:delete-option' && target?.kind === 'option') runDelete('model.delete_value_option', { value_list: target.list, option: target.code })
      if (id === 'model:delete-family' && target?.kind === 'unit_family') runDelete('model.delete_unit_family', { unit_family: target.key })
      if (id === 'model:delete-unit' && target?.kind === 'unit') runDelete('model.delete_unit', { unit_family: target.family, unit: target.code })
      onClose()
      return
    }
    if (id === 'model:delete-group' && session.group) {
      const [structure, group] = session.group.split(':')
      if (structure && group) {
        void api.post('/v1/operations/{name}', { params: { path: { name: "model.delete_group" } }, body: { structure, group } }).then((result) => {
          const proposal = operationId(result)
          if (proposal) {
            void import('./proposal-bus').then(({ publishProposal }) => publishProposal(proposal))
          }
        }).catch((reason: unknown) => {
          reportWriteError(reason)
        })
      }
      onClose()
      return
    }
    if (id === 'selections') {
      setStack((current) => [...current, {
        label: copy.assortments,
        rows: [
          ...selectionItems.map((item) => ({
            id: `selection:open:${String(item.id)}`,
            sourceId: `selection:open:${String(item.id)}`,
            group: 'views' as const,
            title: String(item.name ?? ''),
            subtitle: copy.assortments,
          })),
          { id: 'selection:new', sourceId: 'selection:new', group: 'views' as const, title: copy.newSelection, subtitle: copy.assortments },
          { id: 'selection:edit', sourceId: 'selection:edit', group: 'views' as const, title: copy.editSelection, subtitle: copy.assortments },
          { id: 'selection:delete', sourceId: 'selection:delete', group: 'views' as const, title: copy.deleteSelection, subtitle: copy.assortments },
        ],
      }])
      setQuery('')
      setActive(0)
      return
    }
    if (id === 'selection:new') {
      requestNewSelection()
      onClose()
      return
    }
    if (id === 'selection:save-filter') {
      const filter = readUiContext().filterExpression
      if (!filter) {
        session.push(copy.saveFilterNeeds)
        onClose()
        return
      }
      const type = session.workspaceType || session.listType || ''
      requestNewSelection({
        kind: 'dynamic',
        query: dynamicSelectionFilter(filter, type),
        type,
      })
      onClose()
      return
    }
    if (id === 'selection:edit' || id === 'selection:delete') {
      const action = id
      setStack((current) => [...current, {
        label: action === 'selection:edit' ? copy.editSelection : copy.deleteSelection,
        rows: selectionItems.map((item) => ({
          id: `${action}:${String(item.id)}`,
          sourceId: `${action}:${String(item.id)}`,
          group: 'views' as const,
          title: String(item.name ?? ''),
          subtitle: copy.assortments,
        })),
      }])
      setQuery('')
      setActive(0)
      return
    }
    if (id.startsWith('selection:edit:')) {
      const item = selectionItems.find((row) => String(row.id) === id.slice('selection:edit:'.length))
      if (item) requestEditSelection(item)
      onClose()
      return
    }
    if (id.startsWith('selection:delete:')) {
      const item = selectionItems.find((row) => String(row.id) === id.slice('selection:delete:'.length))
      if (item) requestDeleteSelection(item)
      onClose()
      return
    }
    if (id.startsWith('selection:open:')) {
      const item = selectionItems.find((row) => String(row.id) === id.slice('selection:open:'.length))
      if (item) emitSavedSelection(item)
      onClose()
      return
    }
    if (id === 'assortment:save') {
      const name = query.replace(/^save (?:assortment|selection)\s+/i, '').trim()
      const type = session.workspaceType || session.listType || ''
      void api.post('/v1/operations/{name}', { params: { path: { name: "assortment.save" } }, body: {
          name,
          ...(type ? { type } : {}),
          query: {
            ...(session.group ? { group: session.group } : {}),
          },
        } })
        .then((result) => {
          const proposalId = operationId(result)
          if (!proposalId) return
          publishProposal(proposalId)
          session.setProposalId(proposalId)
          onClose()
        })
        .catch((reason: unknown) => {
          reportWriteError(reason)
        })
      return
    }
    if (id === 'goto:attribute-definitions') {
      const here = views.find((view) => view.type === 'attribute_definitions')
      if (here) {
        dispatchUi('ui.open_view', { id: here.id, zone: 'center' })
      } else {
        queueViewType('attribute_definitions')
        const model = workspaces.find((workspace) => workspace.share_token === 'braian-model')
        if (model) {
          dispatchUi('ui.open_workspace', { id: model.id })
          session.openWorkspace(model.id)
        }
      }
      onClose()
      return
    }
    if (id === 'attr:add-type' || id === 'attr:add-group' || id === 'attr:rename' || id === 'attr:new') {
      const action = id === 'attr:add-type' ? 'add-type' : id === 'attr:add-group' ? 'add-group' : id === 'attr:rename' ? 'rename' : 'new'
      requestAttributeAction(action)
      onClose()
      return
    }
    if (id === 'attr:delete') {
      requestAttributeAction('delete')
      onClose()
      return
    }
    if (id === 'model:rename-key' || id === 'attr:rename-key') {
      if (requestAttributeAction('rename-key')) {
        onClose()
        return
      }
      setQuery('rename attribute key ')
      setActive(0)
      return
    }
    if (id === 'object:move-group') {
      window.dispatchEvent(new Event('braian-move-group'))
      onClose()
      return
    }
    if (id === 'model:allowed-trees') {
      window.dispatchEvent(new Event('braian-allowed-trees'))
      onClose()
      return
    }
    if (id === 'model:command') {
      const deleting = /^delete\b/i.test(query.trim())
      const call = deleting
        ? api.post('/v1/operations/{name}', { params: { path: { name: "model.command" } }, body: { text: query } })
        : stageModel('model.command', { text: query })
      void call
        .then((result) => {
          const proposalId = operationId(result)
          if (proposalId) {
            publishProposal(proposalId)
            session.setProposalId(proposalId)
          }
          onClose()
        })
        .catch((reason: unknown) => {
          reportWriteError(reason)
        })
      return
    }
    if (item.shortcut) toast(`Next time: ${item.shortcut}`)
    if (id === 'ask' || item.group === 'ask') {
      void ask(query)
      return
    }
    const opened = selectedObjectId(item)
    if (opened) {
      session.setObjectId(opened)
      dispatchUi('ui.select', { id: opened })
      onClose()
      return
    }
    if (id === 'suggestions:review') {
      const review = workspaces.find((workspace) => workspace.share_token === 'braian-review')
      if (review) {
        dispatchUi('ui.open_workspace', { id: review.id })
        session.openWorkspace(review.id)
      }
      onClose()
      return
    }
    if (id === 'workspace:delete') {
      window.dispatchEvent(new Event('braian-workspace-delete'))
      onClose()
      return
    }
    if (id.startsWith('workspace:')) {
      const workspaceId = id.slice('workspace:'.length)
      dispatchUi('ui.open_workspace', { id: workspaceId })
      session.openWorkspace(workspaceId)
      onClose()
      return
    }
    if (id.startsWith('layout:')) {
      if (blockUntilWorkspace(id)) return
      const rest = id.slice('layout:'.length)
      if (rest.startsWith('focus:')) dispatchUi('focus', { direction: rest.slice('focus:'.length) })
      else dispatchUi(rest, {})
      onClose()
      return
    }
    if (id.startsWith('type-view:')) {
      session.openTypeView?.(id.slice('type-view:'.length))
      onClose()
      return
    }
    if (id.startsWith('view:')) {
      if (blockUntilWorkspace(id)) return
      dispatchUi('ui.open_view', { id: id.slice(5), zone: 'center' })
      onClose()
      return
    }
    if (id === 'feedback:send') {
      onSendFeedback?.()
      onClose()
      return
    }
    if (id.startsWith('template:')) {
      const template = workspaceTemplates(types).find((item) => item.id === id.slice('template:'.length))
      if (!template) return
      void createWorkspaceFromTemplate(template).then((workspaceId) => {
        dispatchUi('ui.open_template', { template: template.id, id: workspaceId })
        session.openWorkspace(workspaceId)
        session.push(`Workspace ${template.name}`)
        onClose()
      }).catch((error: unknown) => {
        reportWriteError(error)
      })
      return
    }
    const savedTemplateKey = parseSavedTemplateChoice(id)
    if (savedTemplateKey) {
      const template = savedTemplateList.find((item) => item.key === savedTemplateKey)
      if (!template) return
      void createWorkspaceFromSavedTemplate(template).then((workspaceId) => {
        dispatchUi('ui.open_template', { template: `saved:${template.key}`, id: workspaceId })
        session.openWorkspace(workspaceId)
        session.push(`Workspace ${template.name}`)
        onClose()
      }).catch((error: unknown) => {
        reportWriteError(error)
      })
      return
    }
    if (id === 'import:file') {
      window.dispatchEvent(new Event('braian-import-open'))
      onClose()
      return
    }
    if (id === 'object:open') {
      if (blockUntilWorkspace(id)) return
      dispatchUi('ui.open_view', { title: 'Detail', zone: 'center' })
      onClose()
      return
    }
    if (id === 'object:right') {
      if (blockUntilWorkspace(id)) return
      dispatchUi('ui.place', { title: 'Detail', zone: 'right' })
      onClose()
      return
    }
    if (id === 'object:history') {
      if (blockUntilWorkspace(id)) return
      dispatchUi('ui.open_view', { title: 'History', zone: 'center' })
      onClose()
      return
    }
    if (id === 'object:graph') {
      if (blockUntilWorkspace(id)) return
      dispatchUi('ui.open_view', { title: 'Graph', zone: 'center' })
      onClose()
      return
    }
    if (id === 'object:copy' && session.objectId) {
      void navigator.clipboard?.writeText(session.objectId)
      session.push(session.objectId)
      onClose()
      return
    }
    if (registryPaletteCommandIds.has(id)) {
      void runCommand(id)
      if (id !== 'agent:open') onClose()
      return
    }
  }

  const secondaryOf = (item: PaletteItem | undefined): PaletteItem[] => {
    if (!item) return []
    const id = item.sourceId ?? item.id
    if (item.entity || item.group === 'search' || id.startsWith('hit:')) {
      const objectId = id.startsWith('hit:') ? id.slice(4) : id
      return [
        { id: `open:${objectId}`, sourceId: objectId, group: 'object', title: 'Open', subtitle: 'Select this object', kbd: 'Enter' },
        { id: `right:${objectId}`, sourceId: objectId, group: 'object', title: 'Open to the right', subtitle: 'Split the pane', kbd: 'Ctrl+Enter' },
        { id: `copy:${objectId}`, sourceId: objectId, group: 'object', title: 'Copy id', subtitle: objectId },
      ]
    }
    if (id.startsWith('view:') || id.startsWith('workspace:')) {
      return [
        ...(['left', 'right', 'top', 'bottom'] as const).map((zone) => ({
          id: `place:${id}:${zone}`,
          sourceId: id,
          group: 'views' as const,
          title: `Place ${zone}`,
          subtitle: 'Dock the view in that zone',
        })),
        {
          id: `place:${id}:center`,
          sourceId: id,
          group: 'views' as const,
          title: 'New tab',
          subtitle: 'Add the view as a tab',
        },
      ]
    }
    return []
  }

  const ask = async (text: string) => {
    const prompt = text.trim()
    if (!prompt || running) return
    const history = editing == null ? [...turns, { role: 'user' as const, text: prompt }] : turns.map((turn, index) => (index === editing ? { ...turn, text: prompt } : turn))
    setTurns(history.filter((turn) => turn.role === 'user' || turn.role === 'assistant'))
    setEditing(null)
    setQuery('')
    setMode('ai')
    setAnswer('')
    setProposal(null)
    setRunning(true)
    setSteps([{ id: 'read', text: stepText('read'), state: 'run' }])
    session.push(`Agent: ${prompt}`)
    const messages = history.map((turn) => ({ role: turn.role, content: turn.text }))
    try {
      await streamAgent(messages, (event) => applyEvent(event, setSteps, setAnswer, setProposal, session, stepHint(event, types)))
      setSteps((current) => current.map((step) => ({ ...step, state: 'done' })))
    } catch (error) {
      const message = error instanceof ApiError || error instanceof Error ? error.message : 'The model did not reply.'
      setAnswer(message)
    } finally {
      setRunning(false)
    }
  }

  const openActions = (item: PaletteItem | undefined) => {
    if (!item) return
    const actions = secondaryOf(item)
    if (actions.length === 0) return
    setStack((current) => [...current, { label: argumentBreadcrumb(item.title), rows: actions }])
    setQuery('')
    setActive(0)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const row = active == null ? undefined : rows[active]
    const effect = paletteKeyEffect({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      query,
      inQueryField: isPaletteQueryInput(event.target),
      mode,
      stackDepth: stack.length,
      escapeCloses: Boolean(startNewFromTemplate || startSwitchCatalog),
      activeIndex: active,
      rowCount: rows.length,
      row: row
        ? {
            argument: Boolean(row.argument),
            entity: secondaryOf(row).length > 0,
            ask: row.group === 'ask' || row.id === 'ask',
            disabled: row.disabled,
          }
        : undefined,
    })
    if (event.key === 'Tab' || (event.key === 'Enter' && mode === 'list' && active == null)) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (effect.type === 'caret' || effect.type === 'none') return
    event.preventDefault()
    event.stopPropagation()
    if (effect.type === 'close') {
      onClose()
      return
    }
    if (effect.type === 'back') {
      setStack((current) => current.slice(0, -1))
      setActive(null)
      return
    }
    if (effect.type === 'ask') {
      void ask(query)
      return
    }
    if (effect.type === 'actions') {
      openActions(rows[effect.index])
      return
    }
    if (effect.type === 'activate') {
      const item = rows[effect.index]
      if (item) run(item)
      return
    }
    setActive(effect.index)
  }

  const tab = tabHint({
    activeIndex: active,
    argument: Boolean(activeRow?.argument) && !activeRow?.disabled,
    ask: activeRow?.group === 'ask' || activeRow?.id === 'ask',
  })
  const highlighted = rows[active ?? 0]
  const highlightedActions = secondaryOf(highlighted)
  const highlightedRef = useRef(highlighted)
  const highlightedActionsRef = useRef(highlightedActions)
  highlightedRef.current = highlighted
  highlightedActionsRef.current = highlightedActions
  useEffect(() => {
    const onActions = () => {
      const item = highlightedRef.current
      const actions = highlightedActionsRef.current
      if (!item || actions.length === 0) return
      setStack((current) => [...current, { label: argumentBreadcrumb(item.title), rows: actions }])
      setQuery('')
      setActive(0)
    }
    window.addEventListener('braian-palette-actions', onActions)
    return () => window.removeEventListener('braian-palette-actions', onActions)
  }, [])

  const groups = groupBlocks(rows.filter((row) => row.group !== 'ask'))
  const askRow = rows.find((row) => row.group === 'ask')
  const userTurns = turns.filter((turn) => turn.role === 'user')
  const question = userTurns.at(-1)?.text ?? ''
  const selected = active


  if (mode === 'fields') {
    const host = fieldsHost
    const editId = fieldsEditColumnId
    const open: FieldsPaletteOpen = (() => {
      if (editId && host) {
        const col = host.columns.find((item) => item.id === editId)
        if (col) return { kind: 'edit', column: col }
      }
      return { kind: 'browse' }
    })()
    if (!host) {
      return (
        <div className="palette" role="dialog" data-testid="command-palette">
          <p className="muted">Open an object table to select fields.</p>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      )
    }
    return (
      <div className="palette" role="dialog" data-testid="command-palette" data-fields-mode="true">
        <FieldsMode
          open={open}
          columns={host.columns}
          fields={host.fields}
          onClose={onClose}
          onToggleColumn={host.onToggleColumn}
          onShowColumn={host.onShowColumn}
          onReplaceColumn={host.onReplaceColumn}
          peerOptionsForField={host.peerOptionsForField}
          searchPeersForField={host.searchPeersForField}
        />
      </div>
    )
  }

  return (
    <div
      className="palette"
      role="dialog"
      data-testid="command-palette"
      data-entity-row={highlightedActions.length > 0 ? 'true' : 'false'}
      onMouseDown={onClose}
    >
      <Command
        className={mode === 'ai' ? 'ai-panel' : undefined}
        shouldFilter={false}
        loop={false}
        disablePointerSelection
        value={selected == null ? '' : rows[selected]?.id ?? ''}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDownCapture={onKeyDown}
      >
        <div className="palette-query">
          {mode === 'ai' ? <span className="ai-badge" data-testid="ai-badge">AI</span> : null}
          <CommandInput
            ref={inputRef}
            data-testid="palette-input"
            autoFocus
            role="combobox"
            aria-autocomplete="list"
            aria-controls="palette-list"
            data-palette-active={selected == null ? '' : String(selected)}
            value={query}
            placeholder={mode === 'ai' ? 'Ask AI' : commandPlaceholder(types)}
            onValueChange={(value) => {
              setQuery(value)
              setActive(stack.length > 0 && value.trim() ? 0 : null)
            }}
          />
          {mode === 'ai' ? (
            <button type="button" className="icon-btn palette-close" onClick={onClose}>{copy.close}</button>
          ) : null}
        </div>
        <div className="crumb" data-testid="palette-crumb" aria-live="polite">
          {stack.map((crumb) => crumb.label).join(' ')}
        </div>
        {mode === 'ai' ? (
          <div className="ai-log" data-testid="ai-log">
            {userTurns.slice(0, -1).map((turn, index) => (
              <button key={`earlier-${index}`} type="button" className="ai-earlier" onClick={() => { setQuery(turn.text); setEditing(index) }}>
                {turn.text}
              </button>
            ))}
            {question ? <h2 className="ai-question" data-testid="ai-question">{question}</h2> : null}
            {running ? <div className="progress" data-testid="ai-progress"><div className="progress-bar" /></div> : null}
            {steps.length > 0 ? (
              <ol className="ai-steps">
                {steps.map((step) => (
                  <li key={step.id} className={step.state === 'done' ? 'ai-step done' : 'ai-step'} data-testid="ai-step">
                    {step.state === 'done' ? <Check size={14} /> : <span className="ai-step-mark" aria-hidden="true">…</span>}
                    <span>{step.text}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {answer ? <p className="ai-answer" data-testid="ai-answer">{renderAgentAnswer(answer)}</p> : null}
            {proposal ? (
              <div data-testid="palette-proposal">
                <strong>{proposal.title}</strong>
                {proposal.source ? <span className="meta-chip neutral" data-testid="source-badge">{sourceLabel(proposal)}</span> : null}
                <p>{proposal.rows.length} rows</p>
                {proposal.lines.length > 0 ? (
                  <ul className="proposal-tree">
                    {proposal.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {proposal.rows.slice(0, 3).map((row) => (
                  <p key={String(row.id)}>{String(row.object_key ?? row.object_id ?? '')}</p>
                ))}
                {proposal.error ? <p className="error">{proposal.error}</p> : null}
                <div className="toolbar">
                  <Button type="button" variant="danger" onClick={() => void api.post('/v1/proposals/{id}/discard', { params: { path: { id: proposal.id } } }).then(() => setProposal(null))}>{copy.discardAll}</Button>
                  <button type="button" className="primary" onClick={() => void api.post('/v1/proposals/{id}/accept', { params: { path: { id: proposal.id } }, body: {} }).then(() => { session.setProposalId(proposal.id); setProposal(null); session.push(copy.saved) })}>{copy.saveAll}</button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
            <CommandList id="palette-list" role="listbox" aria-activedescendant={rows.length > 0 ? `palette-opt-${selected ?? 0}` : undefined}>
              {groups.map((group) => (
                <div key={group.name} className="palette-group">
                  {group.name !== 'ask' ? <div className="palette-heading">{group.name === 'search' ? searchGroupTitle(hits.map((hit) => hit.typeKey ?? ''), types) : groupTitle[group.name]}</div> : null}
                  {group.rows.map((row) => {
                    const index = rows.indexOf(row)
                    return (
                      <CommandItem
                        key={row.id}
                        id={`palette-opt-${index}`}
                        data-palette-index={index}
                        value={row.id}
                        role="option"
                        aria-selected={index === selected}
                        className={`${index === selected ? 'hit on' : 'hit'}${row.group === 'ask' ? ' ask' : ''}${row.disabled ? ' disabled' : ''}`}
                        disabled={row.disabled}
                        aria-disabled={row.disabled ? true : undefined}
                        onPointerDown={() => setActive(index)}
                        onSelect={() => run(row)}
                      >
                        <span className="hit-copy">
                          <span className="hit-title">{highlight(row.title, query)}</span>
                          {row.subtitle ? <small>{row.subtitle}</small> : null}
                        </span>
                        {row.chips && row.chips.length > 0 ? (
                          <span className="hit-chips">
                            {row.chips.map((chip) => (
                              <MetaChip key={chip.text} tone={chip.tone as ChipTone}>{chip.text}</MetaChip>
                            ))}
                          </span>
                        ) : null}
                        {row.kbd ? <Kbd>{row.kbd}</Kbd> : null}
                      </CommandItem>
                    )
                  })}
                </div>
              ))}
            </CommandList>
        )}
        {mode === 'list' && askRow ? (
          <CommandItem
            id={`palette-opt-${rows.indexOf(askRow)}`}
            data-palette-index={rows.indexOf(askRow)}
            value={askRow.id}
            role="option"
            aria-selected={rows.indexOf(askRow) === selected}
            className={rows.indexOf(askRow) === selected ? 'hit on ask' : 'hit ask'}
            onPointerDown={() => setActive(rows.indexOf(askRow))}
            onSelect={() => run(askRow)}
          >
            <span className="hit-copy">
              <span className="hit-title">{highlight(askRow.title, query)}</span>
              {askRow.subtitle ? <small>{askRow.subtitle}</small> : null}
            </span>
            {askRow.kbd ? <Kbd>{askRow.kbd}</Kbd> : null}
          </CommandItem>
        ) : null}
        <div className="palette-foot" data-testid="palette-foot">
          <span data-testid="palette-active">{activeRow?.subtitle ?? ''}</span>
          <span><Kbd>Enter</Kbd> run</span>
          {tab === 'open' ? <span data-testid="palette-tab-hint"><Kbd>Tab</Kbd> open</span> : null}
          <span><Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> actions</span>
          <span><Kbd>Ctrl</Kbd>+<Kbd>J</Kbd> ask AI</span>
          <span><Kbd>Esc</Kbd> close</span>
        </div>
      </Command>
    </div>
  )
}

function focusedStandard(defs: Json | undefined) {
  const target = modelFocus()
  if (target?.kind !== 'attribute' || !defs) return false
  const row = ((defs.attributes as Json[] | undefined) ?? []).find((item) => String(item.key) === target.key)
  if (!row) return false
  return isStandardAttribute(String(row.id ?? ''), String(row.key ?? ''))
}

function stepHint(event: AgentEvent, types: ReturnType<typeof typeNames>) {
  const key = typeof event.args?.type === 'string' ? event.args.type : typeof event.args?.type_key === 'string' ? event.args.type_key : ''
  const match = key ? types.find((item) => item.key === key) : undefined
  const type = match ?? (types.length === 1 ? types[0] : undefined)
  return type ? { singular: type.singular, plural: type.plural } : undefined
}

function buildCatalog(
  workspaces: Array<{ id: string; name: string; share_token?: string | null }>,
  views: Array<{ id: string; title: string; type: string; state?: Json }>,
  types: ReturnType<typeof typeNames>,
  openTypeKey: string,
  suggestions: number,
  feedbackEnabled?: boolean,
  theme: 'dark' | 'light' = 'dark',
  focusViewId?: string | null,
): PaletteItem[] {
  const focused = focusViewId ? views.find((view) => view.id === focusViewId) : undefined
  const showSelectSource = !focused || focused.type === 'object_table'
  const items: PaletteItem[] = [
    ...(suggestions > 0
      ? [{
          id: 'suggestions:review',
          group: 'views' as const,
          title: suggestedTitle(suggestions),
          subtitle: 'Review agent and import drafts',
          keywords: ['suggested', 'proposal', 'agent', 'import'],
        }]
      : []),
    ...workspaces.map((workspace, index) => ({
      id: `workspace:${workspace.id}`,
      group: 'views' as const,
      title: workspaceDisplayName(workspace.name, workspace.share_token),
      subtitle: 'Open workspace',
      kbd: index < 9 ? `Ctrl+${index + 1}` : undefined,
      shortcut: index < 9 ? `Ctrl+${index + 1}` : undefined,
    })),
    ...typeViewPaletteItems(types),
    ...views.map((view) => ({
      id: `view:${view.id}`,
      group: 'views' as const,
      title: displayViewTitle(view, types, openTypeKey),
      subtitle: 'Open view',
    })),
    newFromTemplateRootItem(),
    { id: 'import:file', group: 'views', title: copy.importFile, subtitle: 'Drop an Excel or CSV file' },
    ...(!views.some((view) => view.type === 'attribute_definitions')
      ? [{
          id: 'goto:attribute-definitions',
          group: 'views' as const,
          title: copy.attributeDefinitions,
          subtitle: copy.dataModel,
          keywords: ['attribute', 'definition', 'model'],
        }]
      : []),
    { id: 'model:rename-key', group: 'model', title: copy.renameKey, subtitle: 'Change a key. External integrations that use the old key will stop working', keywords: ['rename', 'key', 'attribute'] },
    { id: 'model:allowed-trees', group: 'model', title: copy.allowedTrees, subtitle: 'Choose the trees a type may use', keywords: ['tree', 'structure', 'type'] },
    ...registryPaletteRows({ theme, target: { feedbackEnabled } }),
    { id: 'layout:move_view_left', group: 'views', title: 'Move view left', subtitle: 'Move the focused view left', kbd: chordForCommand('layout:move_view_left'), shortcut: chordForCommand('layout:move_view_left') },
    { id: 'layout:move_view_right', group: 'views', title: 'Move view right', subtitle: 'Move the focused view right', kbd: chordForCommand('layout:move_view_right'), shortcut: chordForCommand('layout:move_view_right') },
    { id: 'layout:move_view_up', group: 'views', title: 'Move view up', subtitle: 'Move the focused view up', kbd: chordForCommand('layout:move_view_up'), shortcut: chordForCommand('layout:move_view_up') },
    { id: 'layout:move_view_down', group: 'views', title: 'Move view down', subtitle: 'Move the focused view down', kbd: chordForCommand('layout:move_view_down'), shortcut: chordForCommand('layout:move_view_down') },
    { id: 'layout:focus:left', group: 'views', title: 'Focus pane left', subtitle: 'Focus the neighbour on the left', kbd: chordForCommand('layout:focus:left'), shortcut: chordForCommand('layout:focus:left') },
    { id: 'layout:focus:right', group: 'views', title: 'Focus pane right', subtitle: 'Focus the neighbour on the right', kbd: chordForCommand('layout:focus:right'), shortcut: chordForCommand('layout:focus:right') },
    { id: 'layout:focus:up', group: 'views', title: 'Focus pane up', subtitle: 'Focus the neighbour above', kbd: chordForCommand('layout:focus:up'), shortcut: chordForCommand('layout:focus:up') },
    { id: 'layout:focus:down', group: 'views', title: 'Focus pane down', subtitle: 'Focus the neighbour below', kbd: chordForCommand('layout:focus:down'), shortcut: chordForCommand('layout:focus:down') },
    { id: 'layout:zoom', group: 'views', title: 'Maximize pane', subtitle: 'Show only the focused pane', kbd: chordForCommand('layout:zoom'), shortcut: chordForCommand('layout:zoom') },
    { id: 'layout:close_view', group: 'views', title: 'Close view', subtitle: 'Close the focused view', kbd: chordForCommand('layout:close_view'), shortcut: chordForCommand('layout:close_view') },
    { id: 'layout:reset_layout', group: 'views', title: 'Reset layout', subtitle: 'Restore the saved workspace layout' },
    { id: 'workspace:delete', group: 'views', title: 'Delete workspace', subtitle: 'Remove the active workspace and its layout', keywords: ['delete', 'remove', 'workspace'] },
    addViewRootItem(),
    ...(showSelectSource ? [selectSourceRootItem()] : []),
  ]
  if (feedbackEnabled) {
    items.push({
      id: 'feedback:send',
      group: 'views',
      title: 'Send feedback',
      subtitle: 'Report a bug or share an idea',
      kbd: chordForCommand('feedback:send'),
      shortcut: chordForCommand('feedback:send'),
    })
  }
  return items
}

// Field and column commands for the open table.
function columnEntries(columns: UiColumn[], activeColumn: string | null): PaletteItem[] {
  const items: PaletteItem[] = [
    { id: 'fields:select', group: 'views', title: `${copy.selectFields} ›`, subtitle: 'Choose and reorder columns', keywords: ['field', 'column', 'select', 'show', 'hide', 'reorder'] },
    { id: 'filter:by', group: 'views', title: `${copy.filterBy} ›`, subtitle: 'Attribute, part or link', keywords: ['filter', 'path', 'unit'] },
    { id: 'export:columns', group: 'views', title: `${copy.exportColumns} ›`, subtitle: 'Add a column to the next export', keywords: ['export', 'path', 'column'] },
  ]
  if (columns.some((column) => !column.hidden)) {
    items.push({ id: 'columns:hide', group: 'views', title: `${copy.hideColumn} ›`, subtitle: 'Pick a column in the open table', keywords: ['column'] })
  }
  const active = activeColumn && columns.some((column) => column.id === activeColumn && !column.hidden)
    ? activeColumn
    : null
  if (active) {
    const header = columns.find((column) => column.id === active)?.header ?? active
    items.push(
      {
        id: 'column:move-left',
        group: 'views',
        title: `${copy.moveColumnLeft} · ${header}`,
        subtitle: header,
        keywords: ['column', 'move', 'left', 'reorder', header],
        kbd: chordForCommand('column:move-left'),
        shortcut: chordForCommand('column:move-left'),
      },
      {
        id: 'column:move-right',
        group: 'views',
        title: `${copy.moveColumnRight} · ${header}`,
        subtitle: header,
        keywords: ['column', 'move', 'right', 'reorder', header],
        kbd: chordForCommand('column:move-right'),
        shortcut: chordForCommand('column:move-right'),
      },
    )
  }
  return items
}

function columnRows(columns: UiColumn[], hide: boolean): PaletteItem[] {
  return columns
    .filter((column) => column.hidden !== hide)
    .map((column) => ({
      id: `column:${hide ? 'hide' : 'show'}:${column.id}`,
      group: 'views' as const,
      title: column.header,
      subtitle: hide ? copy.hideColumn : copy.showColumn,
    }))
}

function groupBlocks(rows: PaletteItem[]) {
  const order: PaletteGroup[] = ['recent', 'best', 'object', 'model', 'views', 'search', 'ask']
  return order
    .map((name) => ({ name, rows: rows.filter((row) => row.group === name) }))
    .filter((group) => group.rows.length > 0)
}

function highlight(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return text
  const index = text.toLowerCase().indexOf(needle.toLowerCase())
  if (index < 0) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="mark">{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  )
}

function applyEvent(
  event: AgentEvent,
  setSteps: (value: Step[] | ((current: Step[]) => Step[])) => void,
  setAnswer: (value: string) => void,
  setProposal: (value: ProposalPreview | null) => void,
  session: SessionLike,
  typeHint?: { singular?: string; plural?: string },
) {
  if (event.type === 'step') {
    const text = event.op ? stepText(event.op, event.args, typeHint) : event.text ?? ''
    setSteps((current) => {
      const id = event.id ?? text
      const state = event.state ?? 'run'
      const existing = current.find((step) => step.id === id)
      if (!existing) return [...current.map((step) => ({ ...step, state: 'done' as const })), { id, text, state }]
      return current.map((step) => (step.id === id ? { ...step, text: text || step.text, state } : step))
    })
  }
  if (event.type === 'tool' && event.result) {
    const result = event.result
    if (result.ui === true) applyUiResult(result)
    else     if (event.name) {
      const op = uiOperations.find((name) => name.replaceAll('.', '_') === event.name) ?? event.name
      if (op.startsWith('ui.') && op !== 'ui.get_context' && op !== 'ui.get_selection') {
        dispatchUi(op, (result.args as Json) ?? {})
      }
    }
    const proposalId = String(result.proposal_id ?? (result.needs_approval ? result.id ?? '' : ''))
    if (proposalId) void loadProposal(proposalId, setProposal, session)
  }
  if (event.type === 'proposal' && event.proposal) {
    const id = String(event.proposal.proposal_id ?? event.proposal.id ?? '')
    if (id) void loadProposal(id, setProposal, session)
  }
  if (event.type === 'answer') {
    const text = event.text ?? ''
    setAnswer(text)
    setSteps((current) => current.map((step) => ({ ...step, state: 'done' })))
  }
  if (event.type === 'error') setAnswer(event.text ?? 'The model did not reply.')
}

async function loadProposal(
  id: string,
  setProposal: (value: ProposalPreview | null) => void,
  session: SessionLike,
) {
  const body = await api.get('/v1/proposals/{id}', { params: { path: { id: id } } }).catch(() => null)
  const rows = ((body?.rows as Json[]) ?? [])
  const lines = ((body?.consequence as Json | undefined)?.lines as unknown[] | undefined)?.map(String) ?? []
  setProposal({
    id,
    title: String(body?.title ?? 'Proposal'),
    rows,
    lines,
    source: body?.source ? String(body.source) : undefined,
    actor_name: body?.actor_name,
    behalf_name: body?.behalf_name,
    error: rows.some((row) => row.conflict) ? 'Conflict' : undefined,
  })
  session.setProposalId(id)
  if (lines.length > 0) publishProposal(id)
}
