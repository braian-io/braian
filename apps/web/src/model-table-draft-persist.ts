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

export type StoredModelTableDraft = {
  v: 1
  draftRows: Record<string, StoredAttributeTableRow | unknown>
  pendingDetach: string[]
  pendingDelete: string[]
}

export type RestoredModelTableDraft = {
  draftRows: Record<string, StoredAttributeTableRow>
  pendingDetach: string[]
  pendingDelete: string[]
  trimmed: boolean
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
    if (parsed?.v !== 1 || typeof parsed.draftRows !== 'object' || parsed.draftRows === null) return null
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

export function validateStoredModelTableDraft(
  stored: StoredModelTableDraft,
  defs: Json | undefined,
  selection: ModelSelection | null,
): RestoredModelTableDraft {
  const empty = { draftRows: {}, pendingDetach: [], pendingDelete: [], trimmed: false }
  if (!selectionExists(defs, selection)) return { ...empty, trimmed: true }

  const ids = attributeIds(defs)
  const keys = attributeKeys(defs)
  let trimmed = false
  const draftRows: Record<string, StoredAttributeTableRow> = {}
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
    if (!isStoredRow(value)) {
      trimmed = true
      continue
    }
    const key = value.key.trim()
    const persisted = ids.has(value.id) || ids.has(id)
    if (persisted) {
      draftRows[id] = value
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
  for (const id of stored.pendingDetach) {
    if (ids.has(id)) pendingDetach.push(id)
    else trimmed = true
  }
  const pendingDelete: string[] = []
  for (const id of stored.pendingDelete) {
    if (ids.has(id)) pendingDelete.push(id)
    else trimmed = true
  }

  if (Object.keys(draftRows).length === 0 && pendingDetach.length === 0 && pendingDelete.length === 0) {
    return { ...empty, trimmed: trimmed || stored.pendingDetach.length > 0 || stored.pendingDelete.length > 0 || Object.keys(stored.draftRows).length > 0 }
  }

  return { draftRows, pendingDetach, pendingDelete, trimmed }
}