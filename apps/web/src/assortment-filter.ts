import type { Json } from './api'

/** Typesense filter for a saved selection.
 *
 * `type` on the query is ignored. The selection's type is passed in, so a
 * stored query cannot point the search at another type. Group and label
 * fields may be ids; the index still stores the current keys.
 * `text` is not a filter.
 */
export function assortmentSearchFilter(query: unknown, typeKey = '', defs?: Json): string {
  if (!query || typeof query !== 'object') return typeKey ? `type_key:=${typeKeyOf(typeKey, defs)}` : ''
  const filter = selectionFilterText(query)
  if (filter) {
    const type = typeKey ? `type_key:=${typeKeyOf(typeKey, defs)}` : ''
    if (!type || hasTypeClause(filter)) return filter
    return `${type} && (${filter})`
  }
  const item = query as { group?: unknown; labels?: unknown }
  const parts: string[] = []
  if (typeKey) parts.push(`type_key:=${typeKeyOf(typeKey, defs)}`)
  if (typeof item.group === 'string' && item.group) parts.push(`groups:=${groupKeyOf(item.group, defs)}`)
  parts.push(...labelSearchParts(item.labels, defs))
  return parts.join(' && ')
}

export type SelectionKind = 'dynamic' | 'manual'

export function selectionKind(value: unknown): SelectionKind {
  return value === 'dynamic' ? 'dynamic' : 'manual'
}

/** The stored Typesense filter of a dynamic selection. Manual selections have none. */
export function selectionFilterText(query: unknown): string {
  if (!query || typeof query !== 'object') return ''
  const value = (query as { filter?: unknown }).filter
  return typeof value === 'string' ? value.trim() : ''
}

/** A dynamic selection's query is the string itself, not an object. */
export function selectionQueryValue(kind: SelectionKind, filter: string, manual: Json): Json {
  return (kind === 'dynamic' ? filter.trim() : manual) as unknown as Json
}

/** Keep the type clause when a view filter is saved as a dynamic selection. */
export function dynamicSelectionFilter(filter: string, typeKey: string, defs?: Json): string {
  const text = filter.trim()
  const type = typeKey ? `type_key:=${typeKeyOf(typeKey, defs)}` : ''
  if (!text) return type
  if (!type || hasTypeClause(text)) return text
  return `${type} && (${text})`
}

export function selectionUsageLines(usage: unknown): string[] {
  const record = usage && typeof usage === 'object' ? (usage as Json) : {}
  const rows = (key: string) => (Array.isArray(record[key]) ? (record[key] as Json[]) : [])
  return [
    ...rows('views').map((row) => String(row.title ?? row.id ?? '')),
    ...rows('job_types').map((row) => String(row.title ?? row.key ?? '')),
    ...rows('webhooks').map((row) => String(row.url ?? row.id ?? '')),
  ].filter(Boolean)
}

function hasTypeClause(filter: string) {
  return /(^|[(&|])\s*type_key\s*:/.test(filter)
}

export function typeKeyOf(token: string, defs?: Json) {
  const types = (defs?.types as Json[] | undefined) ?? []
  const match = types.find((item) => String(item.id ?? '') === token || String(item.key ?? '') === token)
  return match ? String(match.key ?? token) : token
}

export function groupKeyOf(token: string, defs?: Json) {
  const structures = (defs?.structures as Json[] | undefined) ?? []
  if (!token.includes(':')) {
    for (const structure of structures) {
      const group = ((structure.groups as Json[]) ?? []).find((item) => String(item.id ?? '') === token || String(item.key ?? '') === token)
      if (group) return `${String(structure.key)}:${String(group.key)}`
    }
    return token
  }
  const [structureToken, groupToken] = token.split(':')
  if (groupToken === 'unplaced') return token
  const structure = structures.find((item) => String(item.id ?? '') === structureToken || String(item.key ?? '') === structureToken)
  const group = ((structure?.groups as Json[]) ?? []).find((item) => String(item.id ?? '') === groupToken || String(item.key ?? '') === groupToken)
  if (structure && group) return `${String(structure.key)}:${String(group.key)}`
  return token
}

/** Label clause only. The object table already applies type and group. */
export function labelSearchFilter(query: unknown, defs?: Json): string {
  if (!query || typeof query !== 'object') return ''
  const item = query as { labels?: unknown }
  return labelSearchParts(item.labels, defs).join(' && ')
}

export function labelCodes(value: unknown): string[] {
  if (typeof value === 'string' && value) return [value]
  if (!Array.isArray(value)) return []
  return value.filter((code): code is string => typeof code === 'string' && code.length > 0)
}

/** A selection is shown in a workspace when its type id or key matches. */
export function selectionMatchesType(
  item: { type?: unknown; type_id?: unknown },
  typeKey: string,
  typeId = '',
): boolean {
  if (!typeKey && !typeId) return false
  const key = typeof item.type === 'string' ? item.type : ''
  const id = typeof item.type_id === 'string' ? item.type_id : ''
  if (typeKey && (key === typeKey || id === typeKey)) return true
  if (typeId && (id === typeId || key === typeId)) return true
  return false
}

export const NEW_SELECTION_EVENT = 'braian-new-selection'
export const EDIT_SELECTION_EVENT = 'braian-edit-selection'
export const DELETE_SELECTION_EVENT = 'braian-delete-selection'
export const SELECTION_APPLIED_EVENT = 'braian-selection-applied'

export type NewSelectionRequest = {
  name?: string
  kind?: SelectionKind
  query?: string
  type?: string
}

export function requestNewSelection(request: NewSelectionRequest = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(NEW_SELECTION_EVENT, { detail: request }))
}

export function requestEditSelection(item: Json) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EDIT_SELECTION_EVENT, { detail: item }))
}

export function requestDeleteSelection(item: Json) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(DELETE_SELECTION_EVENT, { detail: item }))
}


export function emitSavedSelection(item: { id?: unknown; name?: unknown; type?: unknown; type_id?: unknown; query?: unknown }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SELECTION_APPLIED_EVENT, { detail: item }))
}

let selectionLabels: string[] = []

export function publishSelectionLabels(codes: string[]) {
  selectionLabels = codes
}

export function currentSelectionLabels() {
  return selectionLabels
}

function labelSearchParts(value: unknown, defs?: Json): string[] {
  const attribute = ((defs?.attributes as Json[] | undefined) ?? []).find((item) => String(item.key ?? '') === 'labels')
  const id = String(attribute?.id ?? '')
  const field = id ? `a_${id.replaceAll('-', '_')}` : 'a_labels'
  return labelCodes(value).map((code) => `${field}:=${code}`)
}
