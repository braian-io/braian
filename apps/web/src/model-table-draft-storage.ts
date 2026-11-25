import type { Json } from './api'
import {
  modelTableDraftStorageKey,
  readStoredModelTableDraft,
  type StoredModelTableDraft,
} from './model-table-draft-persist'
import type { ModelSelection } from './model-view'

const PREFIX = 'braian.model-table-draft.'

export function listModelTableDraftStorageKeys(storage: Storage, userId: string): string[] {
  const needle = `${PREFIX}${userId}.`
  const out: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(needle)) out.push(key)
  }
  return out
}

export function parseModelTableDraftStorageKey(key: string): { userId: string; workspaceId: string; selectionKey: string } | null {
  if (!key.startsWith(PREFIX)) return null
  const parts = key.slice(PREFIX.length).split('.')
  if (parts.length < 3) return null
  const userId = parts[0] ?? ''
  const workspaceId = parts[1] ?? ''
  const selectionKey = parts.slice(2).join('.')
  if (!userId || !workspaceId || !selectionKey) return null
  return { userId, workspaceId, selectionKey }
}

function typeKeys(defs: Json | undefined): Set<string> {
  const out = new Set<string>()
  for (const raw of (defs?.types as Json[] | undefined) ?? []) {
    const key = String(raw.key ?? '')
    if (key) out.add(key)
  }
  return out
}

function groupSelectionKeys(defs: Json | undefined): Set<string> {
  const out = new Set<string>()
  for (const structure of (defs?.structures as Json[] | undefined) ?? []) {
    const structureKey = String(structure.key ?? structure.id ?? '')
    if (!structureKey) continue
    for (const group of (structure.groups as Json[] | undefined) ?? []) {
      const groupKey = String(group.key ?? '')
      if (groupKey) out.add(`${structureKey}/${groupKey}`)
    }
  }
  return out
}

function selectionValid(selectionKey: string, types: Set<string>, groups: Set<string>) {
  if (selectionKey === '__link_types_table__') return true
  if (types.has(selectionKey)) return true
  return groups.has(selectionKey)
}

export function pruneModelTableDraftStorage(
  userId: string,
  workspaceIds: Set<string>,
  defs: Json | undefined,
  storage: Storage = localStorage,
): string[] {
  if (!defs) return []
  const removed: string[] = []
  const types = typeKeys(defs)
  const groups = groupSelectionKeys(defs)
  for (const key of listModelTableDraftStorageKeys(storage, userId)) {
    const parsed = parseModelTableDraftStorageKey(key)
    if (!parsed || parsed.userId !== userId) continue
    if (!workspaceIds.has(parsed.workspaceId) || !selectionValid(parsed.selectionKey, types, groups)) {
      storage.removeItem(key)
      removed.push(key)
    }
  }
  return removed
}

export function clearModelTableDraftsForWorkspace(userId: string, workspaceId: string, storage: Storage = localStorage) {
  for (const key of listModelTableDraftStorageKeys(storage, userId)) {
    const parsed = parseModelTableDraftStorageKey(key)
    if (parsed?.workspaceId === workspaceId) storage.removeItem(key)
  }
}

export function clearModelTableDraftsForType(userId: string, typeKey: string, storage: Storage = localStorage) {
  for (const key of listModelTableDraftStorageKeys(storage, userId)) {
    const parsed = parseModelTableDraftStorageKey(key)
    if (parsed?.selectionKey === typeKey) storage.removeItem(key)
  }
}

export function readModelTableDraftForKey(
  userId: string,
  workspaceId: string,
  selectionKey: string,
  storage: Storage = localStorage,
): StoredModelTableDraft | null {
  return readStoredModelTableDraft(userId, workspaceId, selectionKey, storage)
}

export function storageKeyForSelection(userId: string, workspaceId: string, selection: ModelSelection | null) {
  if (!selection) return null
  const selectionKey = selection.kind === 'type' ? selection.typeKey : `${selection.structure}/${selection.group}`
  return modelTableDraftStorageKey(userId, workspaceId, selectionKey)
}