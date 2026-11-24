import type { LinkTypeRow } from './link-type-view'

export type PatchableLinkTypeField = keyof Omit<LinkTypeRow, 'id'>

export const PATCHABLE_LINK_TYPE_FIELDS: readonly PatchableLinkTypeField[] = [
  'key',
  'fromType',
  'toType',
  'fromLabel',
  'toLabel',
  'fromCardinality',
  'toCardinality',
] as const

export type StoredLinkFieldChange = {
  base: string
  value: string
}

export type StoredLinkTypeRowPatch = {
  patch: true
  id: string
  key: string
  changes: Partial<Record<PatchableLinkTypeField, StoredLinkFieldChange>>
  keyChange?: StoredLinkFieldChange
}

export type LinkTypeTableDraftPatches = Record<string, Partial<Record<PatchableLinkTypeField, StoredLinkFieldChange>> & {
  __key?: StoredLinkFieldChange
}>

export type StoredLinkTypesTableDraft = {
  v: 1
  draftRows: Record<string, LinkTypeRow | StoredLinkTypeRowPatch>
}

const STORAGE_SUFFIX = '__link_types_table__'

export function linkTypesTableDraftKey(userId: string, workspaceId: string) {
  return `braian.model-table-draft.${userId}.${workspaceId}.${STORAGE_SUFFIX}`
}

export function readStoredLinkTypesTableDraft(userId: string, workspaceId: string, storage?: Storage | null): StoredLinkTypesTableDraft | null {
  if (!userId || !workspaceId) return null
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
  if (!store) return null
  try {
    const raw = store.getItem(linkTypesTableDraftKey(userId, workspaceId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredLinkTypesTableDraft
    if (parsed?.v !== 1 || typeof parsed.draftRows !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredLinkTypesTableDraft(
  userId: string,
  workspaceId: string,
  payload: StoredLinkTypesTableDraft,
  storage?: Storage | null,
) {
  if (!userId || !workspaceId) return
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
  if (!store) return
  store.setItem(linkTypesTableDraftKey(userId, workspaceId), JSON.stringify(payload))
}

export function clearStoredLinkTypesTableDraft(userId: string, workspaceId: string, storage?: Storage | null) {
  if (!userId || !workspaceId) return
  const store = storage ?? (typeof localStorage === 'undefined' ? null : localStorage)
  if (!store) return
  store.removeItem(linkTypesTableDraftKey(userId, workspaceId))
}

function isLinkRow(value: unknown): value is LinkTypeRow {
  if (!value || typeof value !== 'object') return false
  if (isLinkPatch(value)) return false
  const row = value as LinkTypeRow
  return typeof row.id === 'string' && typeof row.key === 'string' && typeof row.fromType === 'string'
}

function isLinkPatch(value: unknown): value is StoredLinkTypeRowPatch {
  if (!value || typeof value !== 'object') return false
  const patch = value as StoredLinkTypeRowPatch
  return patch.patch === true && typeof patch.id === 'string' && typeof patch.key === 'string'
}

export function applyLinkTypePatches(server: LinkTypeRow, changes: LinkTypeTableDraftPatches[string]): LinkTypeRow {
  if (!changes) return server
  const next = { ...server }
  for (const field of PATCHABLE_LINK_TYPE_FIELDS) {
    const change = changes[field]
    if (change && typeof change.value === 'string') {
      if (field === 'fromCardinality' || field === 'toCardinality') {
        next[field] = change.value === 'one' ? 'one' : 'many'
      } else {
        next[field] = change.value as LinkTypeRow[typeof field]
      }
    }
  }
  const keyChange = changes.__key
  if (keyChange?.value) next.key = keyChange.value
  return next
}

export function restoreLinkTypesTableDraft(
  stored: StoredLinkTypesTableDraft,
  serverRows: LinkTypeRow[],
): { draftRows: Record<string, LinkTypeRow>; patches: LinkTypeTableDraftPatches } {
  const byId = new Map(serverRows.map((row) => [row.id, row]))
  const draftRows: Record<string, LinkTypeRow> = {}
  const patches: LinkTypeTableDraftPatches = {}
  for (const [id, value] of Object.entries(stored.draftRows)) {
    const server = byId.get(id)
    if (!server) continue
    if (isLinkPatch(value)) {
      const merged: LinkTypeTableDraftPatches[string] = { ...value.changes, ...(value.keyChange ? { __key: value.keyChange } : {}) }
      patches[id] = merged
      draftRows[id] = applyLinkTypePatches(server, merged)
      continue
    }
    if (isLinkRow(value)) {
      draftRows[id] = value
      continue
    }
    continue
  }
  return { draftRows, patches }
}

export function serializeLinkTypeDraftRow(
  server: LinkTypeRow,
  row: LinkTypeRow,
): StoredLinkTypeRowPatch | LinkTypeRow | null {
  if (server.id !== row.id && !Object.values(PATCHABLE_LINK_TYPE_FIELDS).some((field) => row[field] !== server[field])) {
    return row
  }
  const changes: StoredLinkTypeRowPatch['changes'] = {}
  for (const field of PATCHABLE_LINK_TYPE_FIELDS) {
    if (field === 'key') continue
    if (row[field] !== server[field]) changes[field] = { base: String(server[field]), value: String(row[field]) }
  }
  const keyChange = row.key !== server.key ? { base: server.key, value: row.key } : undefined
  if (Object.keys(changes).length === 0 && !keyChange) return null
  return { patch: true, id: server.id, key: server.key, changes, ...(keyChange ? { keyChange } : {}) }
}