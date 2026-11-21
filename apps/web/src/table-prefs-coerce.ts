import type { Json } from './api'
import {
  columnIdForSortField,
  indexSort,
  normalizeTableSort,
  sortKeyForColumnId,
} from './index-fields'

export const DEFAULT_TABLE_SORT = 'a_number:asc'

const BARE_COLUMN_IDS = new Set(['number', 'key', 'name', 'status', 'type', 'version'])

function sortDirection(sort: string): { field: string; direction: '' | ':asc' | ':desc' } {
  if (sort.endsWith(':asc')) return { field: sort.slice(0, -4), direction: ':asc' }
  if (sort.endsWith(':desc')) return { field: sort.slice(0, -5), direction: ':desc' }
  return { field: sort, direction: '' }
}

function ensureDirection(indexed: string): string {
  if (!indexed) return ''
  if (indexed.endsWith(':asc') || indexed.endsWith(':desc')) return indexed
  return `${indexed}:asc`
}

function searchSortKey(token: string, defs: Json | undefined): string {
  const trimmed = token.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('a_')) {
    return ensureDirection(indexSort(trimmed, defs))
  }
  const { field, direction } = sortDirection(trimmed)
  const columnId = columnIdForSortField(field, defs)
  const key = sortKeyForColumnId(columnId, defs)
  if (!key) return ''
  return ensureDirection(indexSort(direction ? `${key}${direction}` : key, defs))
}

/** Turn a persisted view-row sort into a Typesense-safe token, or the default. */
export function coerceTableSort(sort: unknown, defs?: Json): string {
  if (sort !== undefined && typeof sort !== 'string') return DEFAULT_TABLE_SORT
  const raw = typeof sort === 'string' ? sort.trim() : ''
  if (!raw) return ''

  const { field, direction } = sortDirection(raw)
  if (!direction && BARE_COLUMN_IDS.has(field)) {
    if (field === 'number' || field === 'key') return DEFAULT_TABLE_SORT
    const key = sortKeyForColumnId(field, defs)
    if (key) return ensureDirection(indexSort(key, defs))
    return defs ? DEFAULT_TABLE_SORT : raw
  }

  if (raw.startsWith('a_')) {
    return ensureDirection(indexSort(raw, defs))
  }

  // Attribute-id sorts may be stored before definitions are available in the client.
  if (!defs && (raw.endsWith(':asc') || raw.endsWith(':desc'))) {
    return raw
  }

  const normalized = normalizeTableSort(raw, defs)
  const resolved = searchSortKey(normalized, defs) || searchSortKey(raw, defs)
  if (resolved) return resolved
  return defs ? DEFAULT_TABLE_SORT : raw
}

/** Drop unknown group fields instead of issuing a search that returns zero rows. */
export function coerceTableGroupBy(groupBy: unknown, defs?: Json): string {
  if (groupBy !== undefined && typeof groupBy !== 'string') return ''
  const raw = typeof groupBy === 'string' ? groupBy.trim() : ''
  if (!raw) return ''
  if (raw === 'type_key' || raw === 'version') return raw
  if (raw.startsWith('a_')) {
    const indexed = indexSort(raw, defs)
    return indexed.replace(/:asc$|:desc$/, '') || ''
  }
  if (!defs) return raw
  const resolved = searchSortKey(raw, defs)
  return resolved ? resolved.replace(/:asc$|:desc$/, '') : ''
}