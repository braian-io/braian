import type { Json } from './api'
import type { ModelSelection } from './model-view'
import { ROW_ORDER_KEY } from './standard-editable-table'

export type StoredAttributeTableRow = {
  id: string
  key: string
  label: string
  kind: string
  unit: string
  required: boolean
  showByDefault: boolean
  languages: boolean
  searchable: boolean
  filterable: boolean
  sortable: boolean
  inherited: boolean
  standard: boolean
  multiple: boolean
  min: string
  max: string
  valueList: string
}

export type PatchableAttributeField = keyof Omit<
  StoredAttributeTableRow,
  'id' | 'key' | 'inherited' | 'standard'
>

export const PATCHABLE_ATTRIBUTE_FIELDS: readonly PatchableAttributeField[] = [
  'label',
  'kind',
  'unit',
  'required',
  'showByDefault',
  'languages',
  'searchable',
  'filterable',
  'sortable',
  'multiple',
  'min',
  'max',
  'valueList',
] as const

export type StoredFieldChange = {
  base: string | boolean
  value: string | boolean
}

export type StoredAttributeRowPatch = {
  patch: true
  id: string
  key: string
  changes: Partial<Record<PatchableAttributeField, StoredFieldChange>>
  /** Key renames store the server base separately from label/kind/etc. */
  keyChange?: StoredFieldChange
}

export type AttributeTableDraftPatches = Record<string, Partial<Record<PatchableAttributeField, StoredFieldChange>> & {
  __key?: StoredFieldChange
}>

export type StoredModelTableDraftV1 = {
  v: 1
  draftRows: Record<string, StoredAttributeTableRow | unknown>
  pendingDetach: string[]
  pendingDelete: string[]
}

export type StoredModelTableDraftV2 = {
  v: 2
  draftRows: Record<string, StoredAttributeTableRow | StoredAttributeRowPatch | unknown>
  pendingDetach: string[]
  pendingDelete: string[]
}

export type StoredModelTableDraft = StoredModelTableDraftV1 | StoredModelTableDraftV2

export type DroppedDraftField = { attributeKey: string; field: string }

export type RestoredModelTableDraft = {
  draftRows: Record<string, StoredAttributeTableRow>
  draftPatches: AttributeTableDraftPatches
  pendingDetach: string[]
  pendingDelete: string[]
  trimmed: boolean
  droppedFields: DroppedDraftField[]
}

function storageOrNull(storage?: Storage | null): Storage | null {
  const target = storage === undefined ? (typeof localStorage === 'undefined' ? null : localStorage) : storage
  if (!target) return null
  return target
}

export function modelTableDraftStorageKey(
  userId: string,
  workspaceId: string,
  selectionKey: string,
  storage?: Storage | null,
) {
  void storage
  return `braian.model-table-draft.${userId}.${workspaceId}.${selectionKey}`
}

export function readStoredModelTableDraft(
  userId: string,
  workspaceId: string,
  selectionKey: string,
  storage?: Storage | null,
): StoredModelTableDraft | null {
  if (!userId || !workspaceId || !selectionKey) return null
  const store = storageOrNull(storage)
  if (!store) return null
  try {
    const raw = store.getItem(modelTableDraftStorageKey(userId, workspaceId, selectionKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredModelTableDraft
    if (parsed?.v !== 1 && parsed?.v !== 2) return null
    if (typeof parsed.draftRows !== 'object' || parsed.draftRows === null) return null
    if (!Array.isArray(parsed.pendingDetach) || !Array.isArray(parsed.pendingDelete)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredModelTableDraft(
  userId: string,
  workspaceId: string,
  selectionKey: string,
  payload: StoredModelTableDraft,
  storage?: Storage | null,
) {
  if (!userId || !workspaceId || !selectionKey) return
  const store = storageOrNull(storage)
  if (!store) return
  store.setItem(modelTableDraftStorageKey(userId, workspaceId, selectionKey), JSON.stringify(payload))
}

export function clearStoredModelTableDraft(
  userId: string,
  workspaceId: string,
  selectionKey: string,
  storage?: Storage | null,
) {
  if (!userId || !workspaceId || !selectionKey) return
  const store = storageOrNull(storage)
  if (!store) return
  store.removeItem(modelTableDraftStorageKey(userId, workspaceId, selectionKey))
}

function selectionExists(defs: Json | undefined, selection: ModelSelection | null): boolean {
  if (!selection) return false
  if (selection.kind === 'type') {
    return ((defs?.types as Json[]) ?? []).some((item) => String(item.key) === selection.typeKey)
  }
  return ((defs?.structures as Json[]) ?? []).some((item) => String(item.key) === selection.structure)
}

function attributeIds(defs: Json | undefined): Set<string> {
  return new Set(((defs?.attributes as Json[]) ?? []).map((item) => String(item.id ?? '')).filter(Boolean))
}

function attributeKeys(defs: Json | undefined): Set<string> {
  return new Set(((defs?.attributes as Json[]) ?? []).map((item) => String(item.key ?? '')).filter(Boolean))
}

function isStoredRow(value: unknown): value is StoredAttributeTableRow {
  if (!value || typeof value !== 'object') return false
  const row = value as StoredAttributeTableRow
  return typeof row.id === 'string' && typeof row.key === 'string' && typeof row.label === 'string'
}

function isStoredPatch(value: unknown): value is StoredAttributeRowPatch {
  if (!value || typeof value !== 'object') return false
  const patch = value as StoredAttributeRowPatch
  return patch.patch === true && typeof patch.id === 'string' && typeof patch.key === 'string' && typeof patch.changes === 'object'
}

function serverAttributeRow(defs: Json | undefined, id: string, language = 'en'): StoredAttributeTableRow | null {
  const raw = ((defs?.attributes as Json[]) ?? []).find((item) => String(item.id ?? '') === id)
  if (!raw) return null
  const kind = (raw.kind as Json) ?? {}
  const families = (defs?.unit_families as Json[]) ?? []
  const familyId = String(kind.unit_family ?? '')
  const family = families.find((row) => String(row.id) === familyId || String(row.key) === familyId)
  const index = (raw.index as Json) ?? {}
  const labels = (raw.labels as Record<string, string> | undefined) ?? {}
  const label = String(labels[language] ?? labels.en ?? labels.sv ?? raw.key ?? '')
  return {
    id: String(raw.id ?? id),
    key: String(raw.key ?? ''),
    label,
    kind: String(kind.type ?? 'text'),
    unit: family ? String(family.key ?? '') : '',
    required: Boolean(raw.required),
    showByDefault: raw.show_by_default !== false,
    languages: Boolean(raw.language_dependent),
    searchable: Boolean(index.searchable),
    filterable: Boolean(index.filterable),
    sortable: Boolean(index.sortable),
    inherited: false,
    standard: false,
    multiple: Boolean(raw.multiple),
    min: kind.min === null || kind.min === undefined ? '' : String(kind.min),
    max: kind.max === null || kind.max === undefined ? '' : String(kind.max),
    valueList: String(kind.list ?? ''),
  }
}

function fieldValue(row: StoredAttributeTableRow, field: PatchableAttributeField): string | boolean {
  return row[field]
}

function sameFieldValue(left: string | boolean, right: string | boolean) {
  return left === right
}

export function diffAttributeRowPatches(
  server: StoredAttributeTableRow,
  draft: StoredAttributeTableRow,
): Partial<Record<PatchableAttributeField, StoredFieldChange>> {
  const changes: Partial<Record<PatchableAttributeField, StoredFieldChange>> = {}
  for (const field of PATCHABLE_ATTRIBUTE_FIELDS) {
    const base = fieldValue(server, field)
    const value = fieldValue(draft, field)
    if (!sameFieldValue(base, value)) changes[field] = { base, value }
  }
  return changes
}

export function buildStoredAttributeRowPatch(
  server: StoredAttributeTableRow,
  draft: StoredAttributeTableRow,
): StoredAttributeRowPatch | null {
  const changes = diffAttributeRowPatches(server, draft)
  let keyChange: StoredFieldChange | undefined
  if (draft.key.trim() !== server.key) {
    keyChange = { base: server.key, value: draft.key }
  }
  if (Object.keys(changes).length === 0 && !keyChange) return null
  return { patch: true, id: server.id, key: server.key, changes, ...(keyChange ? { keyChange } : {}) }
}

export function patchesFromFullStoredRow(
  server: StoredAttributeTableRow,
  stored: StoredAttributeTableRow,
): StoredAttributeRowPatch | null {
  return buildStoredAttributeRowPatch(server, stored)
}

function mergePatchOntoServer(
  server: StoredAttributeTableRow,
  patch: StoredAttributeRowPatch,
): StoredAttributeTableRow {
  const merged = { ...server }
  for (const field of PATCHABLE_ATTRIBUTE_FIELDS) {
    const change = patch.changes[field]
    if (change) merged[field] = change.value as never
  }
  if (patch.keyChange) merged.key = String(patch.keyChange.value)
  return merged
}

function reconcilePatch(
  server: StoredAttributeTableRow,
  patch: StoredAttributeRowPatch,
): { patch: StoredAttributeRowPatch; dropped: DroppedDraftField[]; trimmed: boolean } {
  const kept: Partial<Record<PatchableAttributeField, StoredFieldChange>> = {}
  const dropped: DroppedDraftField[] = []
  let trimmed = false
  for (const field of PATCHABLE_ATTRIBUTE_FIELDS) {
    const change = patch.changes[field]
    if (!change) continue
    const current = fieldValue(server, field)
    if (!sameFieldValue(change.base, current)) {
      dropped.push({ attributeKey: server.key || server.id, field })
      trimmed = true
      continue
    }
    kept[field] = change
  }
  let keyChange = patch.keyChange
  if (keyChange && !sameFieldValue(keyChange.base, server.key)) {
    dropped.push({ attributeKey: server.key || server.id, field: 'key' })
    keyChange = undefined
    trimmed = true
  }
  if (Object.keys(kept).length === 0 && !keyChange) {
    return { patch: { patch: true, id: patch.id, key: server.key, changes: {} }, dropped, trimmed }
  }
  return {
    patch: { patch: true, id: patch.id, key: server.key, changes: kept, ...(keyChange ? { keyChange } : {}) },
    dropped,
    trimmed,
  }
}

export function serializeModelTableDraftForStorage(input: {
  draftRows: Record<string, StoredAttributeTableRow>
  draftPatches: AttributeTableDraftPatches
  pendingDetach: string[]
  pendingDelete: string[]
  defs: Json | undefined
}): StoredModelTableDraftV2 {
  const ids = attributeIds(input.defs)
  const serialized: Record<string, StoredAttributeTableRow | StoredAttributeRowPatch | unknown> = {}
  for (const [id, value] of Object.entries(input.draftRows)) {
    if (id === ROW_ORDER_KEY) {
      serialized[id] = value
      continue
    }
    if (!isStoredRow(value)) continue
    if (!ids.has(id) && !ids.has(value.id)) {
      serialized[id] = value
      continue
    }
    const server = serverAttributeRow(input.defs, id) ?? serverAttributeRow(input.defs, value.id)
    if (!server) {
      serialized[id] = value
      continue
    }
    const rowPatches = input.draftPatches[id]
    if (rowPatches) {
      const changes: Partial<Record<PatchableAttributeField, StoredFieldChange>> = {}
      for (const field of PATCHABLE_ATTRIBUTE_FIELDS) {
        const change = rowPatches[field]
        if (change) changes[field] = change
      }
      const keyChange = rowPatches.__key
      if (Object.keys(changes).length > 0 || keyChange) {
        serialized[id] = {
          patch: true,
          id: server.id,
          key: server.key,
          changes,
          ...(keyChange ? { keyChange } : {}),
        }
        continue
      }
    }
    const built = buildStoredAttributeRowPatch(server, value)
    if (built) serialized[id] = built
  }
  return {
    v: 2,
    draftRows: serialized,
    pendingDetach: input.pendingDetach,
    pendingDelete: input.pendingDelete,
  }
}

export function validateStoredModelTableDraft(
  stored: StoredModelTableDraft,
  defs: Json | undefined,
  selection: ModelSelection | null,
): RestoredModelTableDraft {
  const empty: RestoredModelTableDraft = {
    draftRows: {},
    draftPatches: {},
    pendingDetach: [],
    pendingDelete: [],
    trimmed: false,
    droppedFields: [],
  }
  if (!selectionExists(defs, selection)) return { ...empty, trimmed: true }

  const ids = attributeIds(defs)
  const keys = attributeKeys(defs)
  let trimmed = false
  const draftRows: Record<string, StoredAttributeTableRow> = {}
  const draftPatches: AttributeTableDraftPatches = {}
  const droppedFields: DroppedDraftField[] = []
  const seenKeys = new Set<string>()

  for (const [id, value] of Object.entries(stored.draftRows)) {
    if (id === ROW_ORDER_KEY) {
      if (!Array.isArray(value)) {
        trimmed = true
        continue
      }
      const filtered = value.filter((item) => typeof item === 'string' && (ids.has(item) || isStoredRow(stored.draftRows[item])))
      if (filtered.length !== value.length) trimmed = true
      if (filtered.length > 0) draftRows[ROW_ORDER_KEY] = filtered as unknown as StoredAttributeTableRow
      continue
    }

    const persisted = ids.has(id) || (isStoredRow(value) && ids.has(value.id)) || (isStoredPatch(value) && ids.has(value.id))

    if (isStoredPatch(value) && persisted) {
      const server = serverAttributeRow(defs, value.id)
      if (!server) {
        trimmed = true
        continue
      }
      const reconciled = reconcilePatch(server, value)
      trimmed = trimmed || reconciled.trimmed
      droppedFields.push(...reconciled.dropped)
      const hasChanges = Object.keys(reconciled.patch.changes).length > 0 || reconciled.patch.keyChange
      if (hasChanges) {
        draftRows[id] = mergePatchOntoServer(server, reconciled.patch)
        const rowPatch: AttributeTableDraftPatches[string] = { ...reconciled.patch.changes }
        if (reconciled.patch.keyChange) rowPatch.__key = reconciled.patch.keyChange
        draftPatches[id] = rowPatch
        if (server.key) seenKeys.add(server.key)
      }
      continue
    }

    if (!isStoredRow(value)) {
      trimmed = true
      continue
    }

    const key = value.key.trim()
    if (persisted) {
      const server = serverAttributeRow(defs, value.id) ?? serverAttributeRow(defs, id)
      if (!server) {
        trimmed = true
        continue
      }
      const patch = patchesFromFullStoredRow(server, value)
      if (!patch) continue
      const reconciled = reconcilePatch(server, patch)
      trimmed = trimmed || reconciled.trimmed
      droppedFields.push(...reconciled.dropped)
      const hasChanges = Object.keys(reconciled.patch.changes).length > 0 || reconciled.patch.keyChange
      if (hasChanges) {
        draftRows[id] = mergePatchOntoServer(server, reconciled.patch)
        const rowPatch: AttributeTableDraftPatches[string] = { ...reconciled.patch.changes }
        if (reconciled.patch.keyChange) rowPatch.__key = reconciled.patch.keyChange
        draftPatches[id] = rowPatch
      }
      if (key) seenKeys.add(key)
      continue
    }
    if (!key || keys.has(key) || seenKeys.has(key)) {
      trimmed = true
      continue
    }
    seenKeys.add(key)
    draftRows[id] = value
  }

  const pendingDetach: string[] = []
  for (const detachId of stored.pendingDetach) {
    if (ids.has(detachId)) pendingDetach.push(detachId)
    else trimmed = true
  }
  const pendingDelete: string[] = []
  for (const deleteId of stored.pendingDelete) {
    if (ids.has(deleteId)) pendingDelete.push(deleteId)
    else trimmed = true
  }

  if (Object.keys(draftRows).length === 0 && pendingDetach.length === 0 && pendingDelete.length === 0) {
    return {
      ...empty,
      trimmed: trimmed || stored.pendingDetach.length > 0 || stored.pendingDelete.length > 0 || Object.keys(stored.draftRows).length > 0,
      droppedFields,
    }
  }

  return { draftRows, draftPatches, pendingDetach, pendingDelete, trimmed, droppedFields }
}

export function applyDraftPatchesToRow<T extends StoredAttributeTableRow>(
  server: T,
  patches: AttributeTableDraftPatches[string] | undefined,
): T {
  if (!patches) return server
  const next = { ...server }
  for (const field of PATCHABLE_ATTRIBUTE_FIELDS) {
    const change = patches[field]
    if (change) next[field] = change.value as never
  }
  if (patches.__key) next.key = String(patches.__key.value)
  return next
}