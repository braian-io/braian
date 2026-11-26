import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Lock, MoreHorizontal } from 'lucide-react'
import { ApiError, api, jsonRecord, textValue, type Json } from './api'
import { rowsFromCatalog } from './attribute-rows'
import { formatCount } from './format'
import { Button } from './components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './components/ui/dropdown-menu'
import { copy, uiLanguage } from './i18n'
import {
  attributeConflict,
  attributeKey,
  attributeRows,
  objectTypes,
  type AttributeRow,
  type ModelSelection,
} from './model-view'
import { structureCaption } from './graph-scene'
import { StructureSection } from './structure-tree'
import { StateNote } from './states'
import { noteAllowedTreesFocus, onDraftChange, requestReview, setModelFocus, stageModel, stageModelSteps, StructuresCancelled } from './model-stage'
import { getModelSelection, getPreviewType, setPreviewType, subscribeModelSelection } from './model-selection'
import {
  applyDraftPatchesToRow,
  clearStoredModelTableDraft,
  PATCHABLE_ATTRIBUTE_FIELDS,
  readStoredModelTableDraft,
  serializeModelTableDraftForStorage,
  validateStoredModelTableDraft,
  writeStoredModelTableDraft,
  type AttributeTableDraftPatches,
  type PatchableAttributeField,
  type StoredAttributeTableRow,
  type StoredTypeHeaderPatch,
} from './model-table-draft-persist'
import { buildAttributeReorderStep } from './attribute-reorder-steps'
import { readModelTableDraftForKey, storageKeyForSelection } from './model-table-draft-storage'
import {
  buildTypeHeaderSteps,
  recordTypeHeaderStringField,
  recordTypeHeaderStructuresField,
  typeHeaderPatchDirty,
} from './type-header-table-steps'
import { valueListLabel } from './value-list-table-steps'
import { registerModelTableDraft, tryChooseModelSelection } from './model-table-draft'
import { buildAttributeCreateSteps, buildAttributeUpdateSteps } from './attribute-table-steps'
import { MODEL_RELOADED_EVENT } from './model-reload-banner'
import { stashModelPaneNotice, takeModelPaneNotice } from './model-pane-notice'
import { CreateDialog, requireText } from './create-dialog'
import { onAttributeAction, type AttributeAction } from './attribute-actions'
import { writeErrorMessage } from './write-error'
import { ROW_ORDER_KEY, StandardEditableTable, type StandardColumn } from './standard-editable-table'

type View = { state: Json }

const KINDS = [
  ['text', copy.kindText],
  ['number', copy.number],
  ['boolean', copy.kindBoolean],
  ['date', copy.kindDate],
  ['value_list', copy.kindValueList],
  ['range', copy.kindRange],
  ['file_ref', copy.kindFile],
] as const

function useModelSelection() {
  const [value, setValue] = useState({ selection: getModelSelection(), previewType: getPreviewType() })
  useEffect(() => subscribeModelSelection(() => {
    setValue({ selection: getModelSelection(), previewType: getPreviewType() })
  }), [])
  return { ...value, choose: tryChooseModelSelection, setPreviewType }
}

export type ModelTableDraftScope = {
  userId: string
  workspaceId: string
}

export function DataModel({ view, draftScope }: { view: View; draftScope?: ModelTableDraftScope }) {
  const queryClient = useQueryClient()
  const stored = useQuery({ queryKey: ['definitions'], queryFn: () => api.get('/v1/definitions') })
  const draft = useQuery({ queryKey: ['model-draft'], queryFn: () => api.get('/v1/model/draft') })
  useEffect(() => onDraftChange(() => {
    void queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }), [queryClient])
  const mode = String(view.state.mode ?? '')
  if (stored.isPending) return <div data-testid="data-model"><StateNote tone="loading" title={copy.loadingModel} /></div>
  if (stored.isError) return <div data-testid="data-model"><StateNote tone="error" title={copy.errorModel} detail={copy.validation} /></div>
  const preview = draft.data?.conflict === true ? undefined : (draft.data?.definitions as Json | undefined)
  const defs = preview ?? stored.data
  // Preview (card) removed. Structures stay as a tree (not ModelNav type/list chrome).
  // Object/link/value list/unit tables cover those entities. Type attributes use mode=classes.
  if (mode === 'classes' || mode === 'attributes') {
    return <AttributesTable defs={defs} draftScope={draftScope} />
  }
  if (mode === 'impact') return <ImpactNote />
  if (mode === 'card' || mode === 'editor') return <StateNote tone="empty" title={copy.pickModel} />
  return <StructuresPane defs={defs} />
}

function StructuresPane({ defs }: { defs: Json | undefined }) {
  const { selection, choose } = useModelSelection()
  return (
    <div data-testid="data-model" className="model-nav">
      <StructureSection defs={defs} selection={selection} onPick={choose} />
    </div>
  )
}


type AttributeTableRow = AttributeRow & {
  standard: boolean
  multiple: boolean
  min: string
  max: string
  valueList: string
  integer: boolean
  maxLength: string
  textForm: string
  media: boolean
}

const RULE_COLUMN_IDS = new Set([
  'multiple',
  'filterable',
  'sortable',
  'min',
  'max',
  'integer',
  'maxLength',
  'textForm',
  'media',
  'valueList',
])

function ruleColumnApplies(columnId: string, kind: string) {
  switch (columnId) {
    case 'min':
    case 'max':
    case 'integer':
      return kind === 'number'
    case 'maxLength':
    case 'textForm':
      return kind === 'text'
    case 'media':
      return kind === 'file_ref'
    case 'valueList':
      return kind === 'value_list'
    case 'multiple':
    case 'filterable':
    case 'sortable':
      return true
    default:
      return true
  }
}

const decimalPattern = /^-?\d+(\.\d+)?$/
const positiveIntegerPattern = /^[1-9]\d*$/

function validateDecimal(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!decimalPattern.test(trimmed)) return copy.linkFieldNumber
  return undefined
}

function validateMaxLength(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (!positiveIntegerPattern.test(trimmed)) return copy.enterPositiveInteger
  return undefined
}

function detailRow(defs: Json | undefined, row: AttributeRow): AttributeTableRow {
  const raw = ((defs?.attributes as Json[]) ?? []).find(
    (item) => String(item.id ?? '') === row.id || String(item.key ?? '') === row.key,
  )
  const kind = (raw?.kind as Json) ?? {}
  const kindName = String(kind.type ?? row.kind)
  return {
    ...row,
    standard: standardAttribute(row.id),
    multiple: Boolean(raw?.multiple),
    min: kind.min === null || kind.min === undefined ? '' : String(kind.min),
    max: kind.max === null || kind.max === undefined ? '' : String(kind.max),
    valueList: String(kind.list ?? ''),
    integer: kindName === 'number' && Boolean(kind.integer),
    maxLength:
      kind.max_length === null || kind.max_length === undefined ? '' : String(kind.max_length),
    textForm: String(kind.form ?? ''),
    media: kindName === 'file_ref' && Boolean(kind.media),
    description: typeof raw?.description === 'string' ? raw.description : row.description,
  }
}

function errorText(reason: unknown) {
  return reason instanceof ApiError ? reason.message : reason instanceof Error ? reason.message : copy.validation
}

function AttributeMenu({
  row,
  onDetach,
  onDelete,
}: {
  row: AttributeTableRow
  onDetach?: () => void
  onDelete?: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="icon-btn" aria-label={copy.more} data-testid={`attr-menu-${row.key || row.id}`}>
        <MoreHorizontal size={14} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
        {onDetach ? <DropdownMenuItem onSelect={onDetach}>{copy.removeFromThisType}</DropdownMenuItem> : null}
        {onDelete ? <DropdownMenuItem onSelect={onDelete}>{copy.deleteAttributeEverywhere}</DropdownMenuItem> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function AttributesTable({ defs, draftScope }: { defs: Json | undefined; draftScope?: ModelTableDraftScope }) {
  const queryClient = useQueryClient()
  const listed = useQuery({
    queryKey: ['attribute-definitions'],
    queryFn: () => api.post('/v1/operations/{name}', {
      params: { path: { name: 'model.list_attribute_definitions' } },
      body: {},
    }),
  })
  const objectCountsById = useMemo(() => {
    const catalog = jsonRecord(listed.data)
    if (!catalog) return new Map<string, number>()
    return new Map(rowsFromCatalog(catalog).map((row) => [row.id, row.objects]))
  }, [listed.data])
  const { selection } = useModelSelection()
  const [filter, setFilter] = useState('')
  const [draftRows, setDraftRows] = useState<Record<string, AttributeTableRow>>({})
  const [draftPatches, setDraftPatches] = useState<AttributeTableDraftPatches>({})
  const [typeHeaderPatch, setTypeHeaderPatch] = useState<StoredTypeHeaderPatch>({})
  const [pendingDetach, setPendingDetach] = useState<Set<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState('')
  const [paneNotice, setPaneNotice] = useState<{ text: string; action?: { label: string; onClick: () => void } } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createKind, setCreateKind] = useState('text')
  const [createValueList, setCreateValueList] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [activeRowId, setActiveRowId] = useState<string | null>(null)
  const restoredDraftToken = useRef('')
  const previousSelectionKey = useRef('')
  const selectionKey = selection ? (selection.kind === 'type' ? selection.typeKey : `${selection.structure}/${selection.group}`) : ''
  const keyAttribute = keyAttributeOf(defs, selection)
  const families = ((defs?.unit_families as Json[]) ?? []).map((item) => String(item.key ?? '')).filter(Boolean)
  const listOptions = useMemo(
    () => ((defs?.value_lists as Json[]) ?? [])
      .map((item) => {
        const key = String(item.key ?? '')
        const name = valueListLabel(defs, key, uiLanguage)
        return { value: key, label: name === key ? key : `${name} ${key}` }
      })
      .filter((item) => item.value),
    [defs],
  )

  useEffect(() => {
    if (previousSelectionKey.current && previousSelectionKey.current !== selectionKey) {
      setPaneNotice(null)
    }
    previousSelectionKey.current = selectionKey
    setFilter('')
    setMessage('')
    setCreateOpen(false)
    setPendingKey(null)
    setActiveRowId(null)
    setTypeHeaderPatch({})
  }, [selectionKey])

  const applyDraftRestoreNotices = (restored: ReturnType<typeof validateStoredModelTableDraft>) => {
    const lines: string[] = []
    if (restored.trimmed) lines.push(copy.modelTableDraftRestoreTrimmed)
    for (const dropped of restored.droppedFields) {
      lines.push(copy.modelTableDraftRestoreFieldDropped(dropped.attributeKey, dropped.field))
    }
    if (lines.length > 0) {
      const text = lines.join(' ')
      stashModelPaneNotice(text)
      setPaneNotice({ text })
    }
  }

  useEffect(() => {
    const text = takeModelPaneNotice()
    if (text) setPaneNotice({ text })
  }, [selectionKey])

  useEffect(() => {
    if (!selectionKey || !selection) {
      setDraftRows({})
      setDraftPatches({})
      setTypeHeaderPatch({})
      setPendingDetach(new Set())
      setPendingDelete(new Set())
      restoredDraftToken.current = ''
      return
    }
    if (!draftScope?.userId || !draftScope.workspaceId || !defs) return
    const token = `${draftScope.userId}:${draftScope.workspaceId}:${selectionKey}`
    if (restoredDraftToken.current === token) return
    restoredDraftToken.current = token
    const stored = readStoredModelTableDraft(draftScope.userId, draftScope.workspaceId, selectionKey)
    if (!stored) {
      setDraftRows({})
      setDraftPatches({})
      setTypeHeaderPatch({})
      setPendingDetach(new Set())
      setPendingDelete(new Set())
      return
    }
    const restored = validateStoredModelTableDraft(stored, defs, selection)
    setDraftRows(restored.draftRows as Record<string, AttributeTableRow>)
    setDraftPatches(restored.draftPatches)
    setTypeHeaderPatch(restored.typeHeader ?? {})
    setPendingDetach(new Set(restored.pendingDetach))
    setPendingDelete(new Set(restored.pendingDelete))
    applyDraftRestoreNotices(restored)
  }, [selectionKey, draftScope?.userId, draftScope?.workspaceId, selection, defs])

  const rows = useMemo(() => {
    const source = attributeRows(defs, selection, uiLanguage).map((row) => detailRow(defs, row))
    const ordered = selection?.kind === 'type'
      ? [...source.filter((row) => row.standard), ...source.filter((row) => !row.standard)]
      : source
    return ordered.filter((row) => !pendingDetach.has(row.id) && !pendingDelete.has(row.id))
  }, [defs, selection, pendingDetach, pendingDelete])

  useEffect(() => {
    if (!pendingKey) return
    const draft = draftRows[pendingKey]
    if (draft) {
      setActiveRowId(draft.id)
      setModelFocus({ kind: 'attribute', key: draft.key })
      setPendingKey(null)
      return
    }
    const row = rows.find((item) => item.key === pendingKey)
    if (!row) return
    setActiveRowId(row.id)
    setModelFocus({ kind: 'attribute', key: row.key })
    setPendingKey(null)
  }, [rows, pendingKey, draftRows])

  const run = (action: AttributeAction) => {
    if (action !== 'new') return
    setCreateName('')
    setCreateKind('text')
    setCreateValueList('')
    setCreateOpen(true)
  }

  const runRef = useRef(run)
  runRef.current = run
  useEffect(() => onAttributeAction((action) => runRef.current(action)), [])

  const allAttributeRows = useMemo(
    () => attributeRows(defs, selection, uiLanguage).map((row) => detailRow(defs, row)),
    [defs, selection],
  )

  const recordRowPatches = (
    rowId: string,
    server: AttributeTableRow,
    draft: AttributeTableRow,
    current: AttributeTableDraftPatches,
  ): AttributeTableDraftPatches[string] | undefined => {
    const prior = current[rowId] ?? {}
    const next: AttributeTableDraftPatches[string] = {}
    let has = false
    for (const field of PATCHABLE_ATTRIBUTE_FIELDS) {
      const value = draft[field]
      const serverBase = server[field]
      if (value !== serverBase) {
        next[field] = { base: prior[field]?.base ?? serverBase, value }
        has = true
      }
    }
    if (draft.key !== server.key) {
      next.__key = { base: prior.__key?.base ?? server.key, value: draft.key }
      has = true
    }
    return has ? next : undefined
  }

  const patch = (row: AttributeTableRow, change: Partial<AttributeTableRow>) => {
    const nextRow = { ...row, ...change }
    setDraftRows((current) => ({ ...current, [row.id]: nextRow }))
    const server = allAttributeRows.find((item) => item.id === row.id)
    if (!server) return
    setDraftPatches((current) => {
      const rowPatch = recordRowPatches(row.id, server, nextRow, current)
      if (!rowPatch) {
        if (!(row.id in current)) return current
        const without = { ...current }
        delete without[row.id]
        return without
      }
      return { ...current, [row.id]: rowPatch }
    })
  }

  const applyDraftRowsChange = (next: Record<string, AttributeTableRow>) => {
    const serverById = new Map(allAttributeRows.map((row) => [row.id, row]))
    setDraftPatches((current) => {
      const updated = { ...current }
      for (const id of Object.keys(updated)) {
        if (!(id in next) || id === ROW_ORDER_KEY) delete updated[id]
      }
      for (const [id, draft] of Object.entries(next)) {
        if (id === ROW_ORDER_KEY) continue
        const server = serverById.get(id)
        if (!server) {
          delete updated[id]
          continue
        }
        const rowPatch = recordRowPatches(id, server, draft, current)
        if (rowPatch) updated[id] = rowPatch
        else delete updated[id]
      }
      return updated
    })
    setDraftRows(next)
  }

  const stageRemove = (row: AttributeTableRow, deleteDefinition: boolean) => {
    const persisted = ((defs?.attributes as Json[]) ?? []).some(
      (item) => String(item.id ?? '') === row.id || String(item.key ?? '') === row.key,
    )
    const attached = rows.some((item) => item.id === row.id)
    if (!persisted) {
      setDraftRows((current) => {
        const next = { ...current }
        delete next[row.id]
        return next
      })
      setDraftPatches((current) => {
        if (!(row.id in current)) return current
        const next = { ...current }
        delete next[row.id]
        return next
      })
      return
    }
    if (deleteDefinition) {
      setPendingDelete((current) => new Set(current).add(row.id))
    } else if (attached) {
      setPendingDetach((current) => new Set(current).add(row.id))
    }
  }

  const attachStep = (attribute: string) => {
    if (!selection) return { op: 'attach_attribute', attribute }
    if (selection.kind === 'type') return { op: 'attach_attribute', attribute, type_key: selection.typeKey }
    return { op: 'attach_attribute', attribute, structure: selection.structure, group: selection.group }
  }

  const buildCreateSteps = (row: AttributeTableRow) =>
    buildAttributeCreateSteps(defs, row, attachStep(row.key.trim() || attributeKey(row.label)))

  const buildUpdateSteps = (original: AttributeTableRow, row: AttributeTableRow) =>
    buildAttributeUpdateSteps(defs, original, row, keyAttribute ?? '')

  const draftRowsRef = useRef(draftRows)
  const draftPatchesRef = useRef(draftPatches)
  const typeHeaderPatchRef = useRef(typeHeaderPatch)
  const pendingDetachRef = useRef(pendingDetach)
  const pendingDeleteRef = useRef(pendingDelete)
  draftRowsRef.current = draftRows
  draftPatchesRef.current = draftPatches
  pendingDetachRef.current = pendingDetach
  pendingDeleteRef.current = pendingDelete
  typeHeaderPatchRef.current = typeHeaderPatch

  const tableDirty = () => (
    pendingDetachRef.current.size > 0
    || pendingDeleteRef.current.size > 0
    || Object.keys(draftRowsRef.current).length > 0
    || typeHeaderPatchDirty(typeHeaderPatchRef.current)
  )

  const discardTableDraft = () => {
    draftRowsRef.current = {}
    draftPatchesRef.current = {}
    pendingDetachRef.current = new Set()
    pendingDeleteRef.current = new Set()
    setDraftRows({})
    setDraftPatches({})
    setPendingDetach(new Set())
    setPendingDelete(new Set())
    setTypeHeaderPatch({})
    setMessage('')
    if (draftScope?.userId && draftScope.workspaceId && selectionKey) {
      clearStoredModelTableDraft(draftScope.userId, draftScope.workspaceId, selectionKey)
    }
  }
  const discardTableDraftRef = useRef(discardTableDraft)
  discardTableDraftRef.current = discardTableDraft
  useEffect(() => {
    const onDiscard = () => discardTableDraftRef.current()
    window.addEventListener('braian-model-table-draft-discard', onDiscard)
    return () => window.removeEventListener('braian-model-table-draft-discard', onDiscard)
  }, [])

  const flushTableDraftRef = useRef<() => Promise<void>>(async () => {})
  const flushTableDraftToModel = async () => {
    const steps: Array<{ op: string } & Record<string, unknown>> = []
    const existing = new Map(allAttributeRows.map((row) => [row.id, row]))
    const byId = new Map(allAttributeRows.map((row) => [row.id, row]))
    for (const id of pendingDelete) {
      const row = byId.get(id)
      if (row) steps.push({ op: 'delete_attribute', key: row.key })
    }
    for (const id of pendingDetach) {
      const row = byId.get(id)
      if (!row || !selection) continue
      if (selection.kind === 'type') {
        steps.push({ op: 'detach_attribute', attribute: row.key, type_key: selection.typeKey })
      } else {
        steps.push({ op: 'detach_attribute', attribute: row.key, structure: selection.structure, group: selection.group })
      }
    }
    for (const row of Object.values(draftRows)) {
      if ((row as { id?: string }).id === ROW_ORDER_KEY) continue
      const original = existing.get(row.id)
      if (original) {
        const effective = applyDraftPatchesToRow(original, draftPatches[row.id])
        steps.push(...buildUpdateSteps(original, effective))
      } else steps.push(...buildCreateSteps(row))
    }
    if (selection?.kind === 'type') steps.push(...buildTypeHeaderSteps(selection.typeKey, typeHeaderPatch, uiLanguage))
    const reorder = selection ? buildAttributeReorderStep(selection, rows, draftRows) : null
    if (reorder) steps.push(reorder)
    if (steps.length === 0) return
    const structures = steps.filter((step) => step.op === 'set_structures')
    const rest = steps.filter((step) => step.op !== 'set_structures')
    if (rest.length > 0) await stageModelSteps(rest)
    for (const step of structures) {
      await stageModel('model.set_structures', {
        type_key: step.type_key,
        structures: step.structures,
      })
    }
    discardTableDraft()
    await queryClient.invalidateQueries({ queryKey: ['model-draft'] })
  }
  flushTableDraftRef.current = flushTableDraftToModel

  const saveRef = useRef<() => Promise<void>>(async () => {})
  const save = async () => {
    setMessage('')
    try {
      await flushTableDraftRef.current()
      requestReview()
    } catch (reason) {
      if (reason instanceof StructuresCancelled) return
      setMessage(errorText(reason))
      throw reason
    }
  }
  saveRef.current = save

  useEffect(() => {
    registerModelTableDraft({
      dirty: tableDirty,
      discard: discardTableDraft,
      review: () => saveRef.current(),
      flushToDraft: () => flushTableDraftRef.current(),
    })
    return () => registerModelTableDraft(null)
  }, [draftRows, draftPatches, typeHeaderPatch, pendingDetach, pendingDelete, selection])

  useEffect(() => {
    if (!draftScope?.userId || !draftScope.workspaceId || !selectionKey) return
    if (!tableDirty()) {
      clearStoredModelTableDraft(draftScope.userId, draftScope.workspaceId, selectionKey)
      return
    }
    writeStoredModelTableDraft(
      draftScope.userId,
      draftScope.workspaceId,
      selectionKey,
      serializeModelTableDraftForStorage({
        draftRows: draftRows as Record<string, StoredAttributeTableRow>,
        draftPatches,
        typeHeader: typeHeaderPatch,
        pendingDetach: [...pendingDetach],
        pendingDelete: [...pendingDelete],
        defs,
      }),
    )
  }, [draftRows, draftPatches, typeHeaderPatch, pendingDetach, pendingDelete, draftScope?.userId, draftScope?.workspaceId, selectionKey, defs])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!draftScope?.userId || !draftScope.workspaceId || !selection || !selectionKey) return
    const storageKey = storageKeyForSelection(draftScope.userId, draftScope.workspaceId, selection)
    if (!storageKey) return
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || event.key !== storageKey || !event.newValue) return
      if (!tableDirty()) return
      setPaneNotice({
        text: copy.modelTableDraftRemoteChanged,
        action: {
          label: copy.loadRemoteDraft,
          onClick: () => {
            const stored = readModelTableDraftForKey(draftScope.userId, draftScope.workspaceId, selectionKey)
            if (!stored) return
            const restored = validateStoredModelTableDraft(stored, defs, selection)
            setDraftRows(restored.draftRows as Record<string, AttributeTableRow>)
            setDraftPatches(restored.draftPatches)
            setTypeHeaderPatch(restored.typeHeader ?? {})
            setPendingDetach(new Set(restored.pendingDetach))
            setPendingDelete(new Set(restored.pendingDelete))
            if (restored.trimmed) setPaneNotice({ text: copy.modelTableDraftRestoreTrimmed })
            else setPaneNotice(null)
          },
        },
      })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [draftScope?.userId, draftScope?.workspaceId, selection, selectionKey, defs, draftRows, typeHeaderPatch, pendingDetach, pendingDelete])

  useEffect(() => {
    const reconcileAfterReload = () => {
      if (!selection || !draftScope?.userId || !draftScope.workspaceId) return
      const freshDefs = queryClient.getQueryData<Json>(['definitions'])
      if (!freshDefs) return
      if (!tableDirty()) return
      const snapshot = serializeModelTableDraftForStorage({
        draftRows: draftRows as Record<string, StoredAttributeTableRow>,
        draftPatches,
        typeHeader: typeHeaderPatch,
        pendingDetach: [...pendingDetach],
        pendingDelete: [...pendingDelete],
        defs: freshDefs,
      })
      const restored = validateStoredModelTableDraft(snapshot, freshDefs, selection)
      setDraftRows(restored.draftRows as Record<string, AttributeTableRow>)
      setDraftPatches(restored.draftPatches)
      setTypeHeaderPatch(restored.typeHeader ?? {})
      setPendingDetach(new Set(restored.pendingDetach))
      setPendingDelete(new Set(restored.pendingDelete))
      applyDraftRestoreNotices(restored)
    }
    window.addEventListener(MODEL_RELOADED_EVENT, reconcileAfterReload)
    return () => window.removeEventListener(MODEL_RELOADED_EVENT, reconcileAfterReload)
  }, [
    draftScope?.userId,
    draftScope?.workspaceId,
    selection,
    draftRows,
    draftPatches,
    typeHeaderPatch,
    pendingDetach,
    pendingDelete,
    queryClient,
  ])

  if (!selection) {
    return (
      <div data-testid="data-model">
        <StateNote tone="empty" title={copy.pickModel} />
      </div>
    )
  }

  const columns: Array<StandardColumn<AttributeTableRow>> = [
    {
      id: 'label',
      header: copy.attributeName,
      editable: true,
      truncate: true,
      read: (row) => row.label,
      write: (row, value) => ({ ...row, label: value }),
      cellTestId: (row) => `attr-label-${row.key || row.id}`,
    },
    {
      id: 'key',
      header: copy.key,
      editable: true,
      truncate: true,
      read: (row) => row.key,
      write: (row, value) => ({ ...row, key: value }),
      cellTestId: (row) => `attr-key-${row.key || row.id}`,
      display: (row) => {
        const locked = row.standard || row.id === keyAttribute
        return (
          <span className={locked ? 'attr-key-lock' : undefined} data-attr={row.key || undefined} title={row.standard ? copy.standardFlag : undefined}>
            {locked ? <Lock size={12} aria-hidden="true" /> : null}
            {row.key || '—'}
          </span>
        )
      },
    },
    {
      id: 'description',
      header: copy.description,
      type: 'text',
      editable: true,
      truncate: true,
      read: (row) => row.description,
      write: (row, value) => ({ ...row, description: value }),
      cellTestId: (row) => `attr-desc-${row.key || row.id}`,
      display: (row) => <span title={row.description || undefined}>{row.description || '—'}</span>,
    },
    {
      id: 'kind',
      header: copy.attributeType,
      type: 'enum',
      editable: true,
      options: KINDS.map(([value, label]) => ({ value, label })),
      read: (row) => row.kind,
      write: (row, value) => ({
        ...row,
        kind: value,
        ...(value === 'number' || value === 'range' ? {} : { unit: '', defaultUnit: '' }),
        ...(value === 'number' ? {} : { min: '', max: '', integer: false }),
        ...(value === 'text' ? {} : { maxLength: '', textForm: '' }),
        ...(value === 'file_ref' ? {} : { media: false }),
        ...(value === 'value_list' ? {} : { valueList: '' }),
      }),
      display: (row) => (
        <span title={!listed.isSuccess || (objectCountsById.get(row.id) ?? 0) > 0 ? copy.attributeTypeLocked : undefined}>
          {kindLabel(row.kind)}
        </span>
      ),
    },
    {
      id: 'unit',
      header: copy.unitFamilies,
      truncate: true,
      width: 120,
      type: 'enum',
      editable: true,
      options: [{ value: 'none', label: copy.noUnit }, ...families.map((family) => ({ value: family, label: family }))],
      read: (row) => row.unit || 'none',
      write: (row, value) => ({
        ...row,
        unit: value === 'none' ? '' : value,
        defaultUnit: value === 'none' ? '' : row.defaultUnit,
      }),
      hideCell: (row) => row.kind !== 'number' && row.kind !== 'range',
      display: (row) => row.unit || '—',
    },
    {
      id: 'defaultUnit',
      header: copy.defaultUnit,
      truncate: true,
      width: 120,
      type: 'enum',
      editable: true,
      options: [
        { value: '', label: '—' },
        ...((defs?.unit_families as Json[]) ?? []).flatMap((family) =>
          ((family.units as Json[]) ?? []).map((unit) => ({
            value: String(unit.code ?? ''),
            label: `${String(family.key ?? '')} · ${String(unit.symbol ?? unit.code ?? '')}`,
          })),
        ),
      ],
      read: (row) => row.defaultUnit,
      write: (row, value) => ({ ...row, defaultUnit: value }),
      hideCell: (row) => row.kind !== 'number' && row.kind !== 'range',
      display: (row) => row.defaultUnit || '—',
    },
    {
      id: 'required',
      header: copy.required,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.required,
      write: (row, value) => ({ ...row, required: value === 'true' }),
    },
    {
      id: 'showByDefault',
      header: copy.showByDefault,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.showByDefault,
      write: (row, value) => ({ ...row, showByDefault: value === 'true' }),
    },
    {
      id: 'languages',
      header: copy.languages,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.languages,
      write: (row, value) => ({ ...row, languages: value === 'true' }),
    },
    {
      id: 'searchable',
      header: copy.searchable,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      read: (row) => row.searchable,
      write: (row, value) => ({ ...row, searchable: value === 'true' }),
    },
    {
      id: 'multiple',
      header: copy.multiple,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      width: 84,
      read: (row) => row.multiple,
      write: (row, value) => ({ ...row, multiple: value === 'true' }),
    },
    {
      id: 'filterable',
      header: copy.filterable,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      width: 84,
      read: (row) => row.filterable,
      write: (row, value) => ({ ...row, filterable: value === 'true' }),
    },
    {
      id: 'sortable',
      header: copy.sortable,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      width: 84,
      read: (row) => row.sortable,
      write: (row, value) => ({ ...row, sortable: value === 'true' }),
    },
    {
      id: 'min',
      header: copy.min,
      type: 'text',
      editable: true,
      width: 72,
      validate: validateDecimal,
      read: (row) => row.min,
      write: (row, value) => ({ ...row, min: value.trim() }),
      hideCell: (row) => !ruleColumnApplies('min', row.kind),
      display: (row) => <span>{row.min || '—'}</span>,
    },
    {
      id: 'max',
      header: copy.max,
      type: 'text',
      editable: true,
      width: 72,
      validate: validateDecimal,
      read: (row) => row.max,
      write: (row, value) => ({ ...row, max: value.trim() }),
      hideCell: (row) => !ruleColumnApplies('max', row.kind),
      display: (row) => <span>{row.max || '—'}</span>,
    },
    {
      id: 'integer',
      header: copy.integer,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      width: 72,
      hideCell: (row) => !ruleColumnApplies('integer', row.kind),
      read: (row) => row.integer,
      write: (row, value) => ({ ...row, integer: value === 'true' }),
    },
    {
      id: 'maxLength',
      header: copy.maxLength,
      type: 'text',
      editable: true,
      width: 88,
      validate: validateMaxLength,
      read: (row) => row.maxLength,
      write: (row, value) => ({ ...row, maxLength: value.trim() }),
      hideCell: (row) => !ruleColumnApplies('maxLength', row.kind),
      display: (row) => <span>{row.maxLength || '—'}</span>,
    },
    {
      id: 'textForm',
      header: copy.textForm,
      type: 'enum',
      editable: true,
      enumSelect: true,
      width: 108,
      options: [
        { value: 'short', label: copy.shortText },
        { value: 'long', label: copy.longText },
      ],
      read: (row) => row.textForm || 'short',
      write: (row, value) => ({ ...row, textForm: value === 'short' ? '' : value }),
      hideCell: (row) => !ruleColumnApplies('textForm', row.kind),
      display: (row) => (
        <span>{!row.textForm || row.textForm === 'short' ? copy.shortText : copy.longText}</span>
      ),
    },
    {
      id: 'media',
      header: copy.media,
      type: 'boolean',
      editable: true,
      display: 'checkbox',
      width: 72,
      hideCell: (row) => !ruleColumnApplies('media', row.kind),
      read: (row) => row.media,
      write: (row, value) => ({ ...row, media: value === 'true' }),
    },
    {
      id: 'valueList',
      header: copy.valueList,
      type: 'enum',
      editable: true,
      enumSelect: true,
      truncate: true,
      width: 120,
      options: [{ value: 'none', label: copy.noValue }, ...listOptions],
      read: (row) => row.valueList || 'none',
      write: (row, value) => ({ ...row, valueList: value === 'none' ? '' : value }),
      hideCell: (row) => !ruleColumnApplies('valueList', row.kind),
      display: (row) => (
        <span>
          {row.valueList ? (
            <>
              {valueListLabel(defs, row.valueList, uiLanguage)}
              <span className="muted"> {row.valueList}</span>
            </>
          ) : '—'}
        </span>
      ),
    },
  ]

  if (selection.kind === 'group') {
    columns.push({
      id: 'from',
      header: copy.from,
      type: 'readonly',
      truncate: true,
      read: (row) => (row.fromKey ? `${copy.fromSource} ${structureCaption(row.fromKey, defs)}` : ''),
      display: (row) => row.fromKey
        ? <span data-testid="attribute-from">{copy.fromSource} {structureCaption(row.fromKey, defs)}</span>
        : <span>—</span>,
    })
  }

  columns.push({
    id: 'menu',
    header: copy.more,
    type: 'readonly',
    width: 48,
    read: () => '',
    display: (row) => {
      if (row.inherited) return null
      const canChange = !row.standard && row.id !== keyAttribute
      return (
        <AttributeMenu
          row={row}
          onDetach={canChange ? () => { void stageRemove(row, false) } : undefined}
          onDelete={canChange ? () => { void stageRemove(row, true) } : undefined}
        />
      )
    },
  })

  const title = selection.kind === 'type'
    ? objectTypes(defs, uiLanguage).find((item) => item.key === selection.typeKey)?.label ?? selection.typeKey
    : structureCaption(selection.group, defs, selection.kind === 'group' ? selection.structure : undefined)

  return (
    <div data-testid="data-model" className="model-attributes">
      <div className="attr-title">
        <span>{title}</span>
      </div>
      {paneNotice ? (
        <p className="inline-hint model-pane-notice" role="status" data-testid="model-pane-notice">
          {paneNotice.text}
          {paneNotice.action ? (
            <Button
              type="button"
              variant="ghost"
              className="inline-hint-action"
              data-testid="model-pane-notice-action"
              onClick={() => {
                paneNotice.action?.onClick()
              }}
            >
              {paneNotice.action.label}
            </Button>
          ) : null}
        </p>
      ) : null}
      {selection.kind === 'type' ? (
        <>
          <TypeNameFields
            defs={defs}
            typeKey={selection.typeKey}
            patch={typeHeaderPatch}
            onError={setMessage}
            onPatch={setTypeHeaderPatch}
          />
          <AllowedTrees defs={defs} typeKey={selection.typeKey} patch={typeHeaderPatch} onPatch={setTypeHeaderPatch} onError={setMessage} />
        </>
      ) : null}
      <StandardEditableTable
        key={selectionKey}
        testId="attribute-table"
        columns={columns}
        rows={rows}
        draftRows={draftRows}
        onDraftRowsChange={applyDraftRowsChange}
        onNewRow={() => run('new')}
        newRowLabel={copy.newAttribute}
        filterValue={filter}
        onFilterChange={setFilter}
        emptyLabel={copy.noAttributesMatch}
        getRowTestId={(row) => (row.inherited ? 'attribute-row-inherited' : 'attribute-row')}
        getRowKeyAttr={(row) => row.key || row.id}
        rowFlags={(row) => ({
          fixed: selection.kind === 'type' && row.standard,
          readOnly: row.inherited,
        })}
        reorderable={selection.kind === 'type' || selection.kind === 'group'}
        canEdit={(row, column) => {
          if (row.inherited) return false
          if (column.id === 'key' && (row.standard || row.id === keyAttribute)) return false
          if (column.id === 'kind' && (!listed.isSuccess || (objectCountsById.get(row.id) ?? 0) > 0)) return false
          if (row.standard && RULE_COLUMN_IDS.has(column.id)) return false
          if (!ruleColumnApplies(column.id, row.kind)) return false
          if (column.id === 'unit' && row.kind !== 'number' && row.kind !== 'range') return false
          if (column.id === 'languages' && row.kind !== 'text') return false
          return true
        }}
        activeRowId={activeRowId}
        onActivateRow={(row) => {
          setActiveRowId(row.id)
          if (row.key) setModelFocus({ kind: 'attribute', key: row.key })
        }}
        reviewVisible={tableDirty()}
        onReviewAndSave={save}
      />
      <CreateDialog
        open={createOpen}
        title={copy.newAttribute}
        description={copy.createNameHint}
        fields={[
          { id: 'name', label: copy.name, value: createName, testId: 'new-name', autoFocus: true },
          {
            id: 'kind',
            label: copy.attributeType,
            value: createKind,
            testId: 'new-type',
            options: KINDS.map(([value, label]) => ({ value, label })),
          },
          ...(createKind === 'value_list'
            ? [{
              id: 'valueList',
              label: copy.valueList,
              value: createValueList,
              testId: 'new-value-list',
              options: listOptions,
            }]
            : []),
        ]}
        onField={(id, value) => {
          if (id === 'name') setCreateName(value)
          else if (id === 'kind') {
            setCreateKind(value)
            if (value !== 'value_list') setCreateValueList('')
          } else setCreateValueList(value)
        }}
        onClose={() => setCreateOpen(false)}
        onSubmit={async () => {
          const label = requireText(createName)
          const key = attributeKey(label)
          if (!key) throw new Error(copy.validation)
          const unit = ''
          if (attributeConflict(defs, key, createKind, unit)) throw new Error(copy.conflictAttribute)
          if (createKind === 'value_list' && !createValueList.trim()) throw new Error(copy.validation)
          const row: AttributeTableRow = {
            id: key,
            key,
            label,
            description: '',
            kind: createKind,
            unit: '',
            defaultUnit: '',
            required: false,
            showByDefault: true,
            languages: createKind === 'text',
            searchable: false,
            filterable: false,
            sortable: false,
            inherited: false,
            standard: false,
            multiple: false,
            min: '',
            max: '',
            valueList: createKind === 'value_list' ? createValueList.trim() : '',
            integer: false,
            maxLength: '',
            textForm: '',
            media: false,
          }
          setDraftRows((current) => ({ ...current, [key]: row }))
          setActiveRowId(key)
          setModelFocus({ kind: 'attribute', key })
          setPendingKey(null)
          setCreateOpen(false)
        }}
      />
      {message ? <p className="error">{message}</p> : null}
    </div>
  )
}

function AllowedTrees({
  defs,
  typeKey,
  patch,
  onPatch,
  onError,
}: {
  defs: Json | undefined
  typeKey: string
  patch: StoredTypeHeaderPatch
  onPatch: (next: StoredTypeHeaderPatch) => void
  onError: (message: string) => void
}) {
  const raw = ((defs?.types as Json[]) ?? []).find((item) => String(item.key) === typeKey)
  const base = Array.isArray(raw?.structures) ? raw.structures.map((id) => String(id)) : []
  const selected = new Set(patch.structures?.value ?? patch.structures?.base ?? base)
  const structures = ((defs?.structures as Json[]) ?? [])
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    const open = () => setFocus(true)
    window.addEventListener('braian-allowed-trees', open)
    return () => window.removeEventListener('braian-allowed-trees', open)
  }, [])
  return (
    <fieldset className="type-names" data-testid="allowed-trees">
      <legend title={copy.allowedTreesHint}>{copy.allowedTrees.replace('…', '')}</legend>
      <p className="hint">{copy.allowedTreesHint}</p>
      {structures.map((structure, index) => {
        const id = String(structure.id ?? structure.key)
        const checked = selected.has(id) || selected.has(String(structure.key))
        const label = textValue(structure.labels as Json, uiLanguage) || String(structure.key)
        return (
          <label key={id}>
            <input
              type="checkbox"
              autoFocus={focus && index === 0}
              checked={checked}
              onFocus={(event) => noteAllowedTreesFocus(event.currentTarget)}
              onChange={(event) => {
                noteAllowedTreesFocus(event.currentTarget)
                onError('')
                const next = new Set(selected)
                if (event.target.checked) next.add(id)
                else next.delete(id)
                const value = [...next]
                const change = recordTypeHeaderStructuresField(base, value, patch.structures)
                if (!change) {
                  const { structures, ...rest } = patch
                  onPatch(rest)
                  return
                }
                onPatch({ ...patch, structures: change as StoredTypeHeaderPatch['structures'] })
              }}
            />
            {label}
          </label>
        )
      })}
    </fieldset>
  )
}

function indefiniteHere(name: string) {
  const lower = name.toLowerCase()
  const article = /^[aeiou]/i.test(lower) ? 'An' : 'A'
  return `${article} ${lower} here gets these fields`
}

function TypeNameFields({
  defs,
  typeKey,
  patch,
  onError,
  onPatch,
}: {
  defs: Json | undefined
  typeKey: string
  patch: StoredTypeHeaderPatch
  onError: (message: string) => void
  onPatch: (next: StoredTypeHeaderPatch) => void
}) {
  const row = objectTypes(defs, uiLanguage).find((item) => item.key === typeKey)
  const raw = ((defs?.types as Json[]) ?? []).find((item) => String(item.key) === typeKey)
  const singularBase = textValue(raw?.singular, uiLanguage) || row?.singular || ''
  const pluralBase = textValue(raw?.plural, uiLanguage) || row?.plural || ''
  const singularValue = String(patch.singular?.value ?? singularBase)
  const pluralValue = String(patch.plural?.value ?? pluralBase)
  const keyValue = String(patch.typeKey?.value ?? typeKey)
  return (
    <div className="type-names">
      <label>
        {copy.singular}
        <input
          aria-label={copy.singular}
          value={singularValue}
          onChange={(event) => {
            onError('')
            const next = event.target.value
            const change = recordTypeHeaderStringField(singularBase, next.trim(), patch.singular)
            if (!change) {
              const { singular, ...rest } = patch
              onPatch(rest)
              return
            }
            onPatch({ ...patch, singular: change as StoredTypeHeaderPatch['singular'] })
          }}
        />
      </label>
      <label>
        {copy.plural}
        <input
          aria-label={copy.plural}
          value={pluralValue}
          onChange={(event) => {
            onError('')
            const next = event.target.value
            const change = recordTypeHeaderStringField(pluralBase, next.trim(), patch.plural)
            if (!change) {
              const { plural, ...rest } = patch
              onPatch(rest)
              return
            }
            onPatch({ ...patch, plural: change as StoredTypeHeaderPatch['plural'] })
          }}
        />
      </label>
      <label>
        {copy.key}
        <input
          aria-label={copy.key}
          data-testid={`type-key-${typeKey}`}
          value={keyValue}
          onChange={(event) => {
            onError('')
            const next = event.target.value.trim()
            const change = recordTypeHeaderStringField(typeKey, next, patch.typeKey)
            if (!change) {
              const { typeKey: _drop, ...rest } = patch
              onPatch(rest)
              return
            }
            onPatch({ ...patch, typeKey: change as StoredTypeHeaderPatch['typeKey'] })
          }}
        />
      </label>
    </div>
  )
}

function typeName(defs: Json | undefined, key: string) {
  return objectTypes(defs, uiLanguage).find((item) => item.key === key)?.label ?? structureCaption(key, defs)
}

const STANDARD_ATTRIBUTE_IDS = new Set([
  "018f0000-0000-7000-8000-000000000100",
  "018f0000-0000-7000-8000-000000000101",
  "018f0000-0000-7000-8000-00000000a003",
  "018f0000-0000-7000-8000-00000000a004",
  "018f0000-0000-7000-8000-00000000a005",
])

function standardAttribute(id: string) {
  return STANDARD_ATTRIBUTE_IDS.has(id)
}

function keyAttributeOf(defs: Json | undefined, selection: ModelSelection | null) {
  if (!defs || selection?.kind !== 'type') return ''
  const objectType = ((defs.types as Json[]) ?? []).find((item) => String(item.key) === selection.typeKey)
  return String(objectType?.key_attribute ?? '')
}

function kindLabel(kind: string) {
  return KINDS.find(([value]) => value === kind)?.[1] ?? kind
}

function ImpactNote() {
  const queryClient = useQueryClient()
  const [attribute, setAttribute] = useState('status')
  const [result, setResult] = useState<Json | null>(null)
  const [error, setError] = useState('')
  return (
    <div data-testid="data-model">
      <p className="hint">{copy.reviewChange}</p>
      <form
        className="toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          void api.post('/v1/impact', { body: { remove_attribute: attribute } })
            .then((body) => {
              setResult(body)
              void queryClient.invalidateQueries({ queryKey: ['definitions'] })
            })
            .catch((reason: unknown) => {
              setError(writeErrorMessage(reason) ?? copy.validation)
            })
        }}
      >
        <input data-testid="impact-attribute" value={attribute} onChange={(event) => setAttribute(event.target.value)} />
        <Button type="submit" variant="default" data-testid="impact-run">{copy.calculate}</Button>
      </form>
      {error ? <p className="error" data-testid="impact-error">{error}</p> : null}
      {result ? (
        <div data-testid="impact-result">
          <p>{copy.affected}: {formatCount(result.affected_objects)}</p>
          <p>{copy.samples}: {((result.samples as Json[]) ?? []).map((item) => String(item.key)).join(', ')}</p>
          {((result.jobs as Json[]) ?? []).map((job) => (
            <p key={String(job.key)}>{String(job.title)}</p>
          ))}
        </div>
      ) : null}
    </div>
  )
}
