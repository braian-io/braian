import type { QueryClient } from '@tanstack/react-query'
import { api, recordNumber, type Json } from './api'
import { attributeByKey, readIndexed } from './index-fields'
import { markObjectGone, objectFetchQueryOptions, objectGone } from './object-gone'
import { parseColumnId } from './fields/columns'
import { reconcileObjectWrite } from './object-write'

export const LIST_PREVIEW = '__listPreview' as const

export type ListRowPreviewSource = {
  id: string
  key: string
  type: string
  version: string
  name: string
  status: string
  doc: Json
}

export function isListPreview(value: unknown): value is Json & { [LIST_PREVIEW]?: true } {
  return Boolean(value && typeof value === 'object' && (value as Json)[LIST_PREVIEW])
}

function versionOf(value: Json | undefined): number {
  const version = Number(value?.version)
  return Number.isFinite(version) ? version : 0
}

/** Build a partial Postgres-shaped object from a Typesense hit / table row. */
export function buildListPreviewFromRow(
  row: ListRowPreviewSource,
  defs: Json | undefined,
  language: string,
  pathValuesForRow?: Record<string, string[]>,
): Json {
  const values: Json = {
    number: row.key || recordNumber(row.doc),
    name: { [language]: row.name || readIndexed(row.doc, defs, 'name') },
    status: row.status || readIndexed(row.doc, defs, 'status'),
  }
  if (pathValuesForRow) {
    for (const [columnId, cells] of Object.entries(pathValuesForRow)) {
      const { path } = parseColumnId(columnId)
      const key = path.split('.')[0]?.split('@')[0] ?? path
      if (!key || key === 'number' || key === 'name' || key === 'status') continue
      const attribute = attributeByKey(defs, key)
      const text = (cells ?? []).map((item) => String(item ?? '').trim()).filter(Boolean).join(', ')
      if (!text) continue
      if (attribute?.language_dependent) {
        const languageKey = path.includes('@') ? path.split('@')[1]! : language
        const record = (values[key] as Json | undefined) ?? {}
        values[key] = { ...(typeof record === 'object' && record && !Array.isArray(record) ? record : {}), [languageKey]: text }
      } else {
        values[key] = text
      }
    }
  }
  for (const attribute of ((defs?.attributes as Json[] | undefined) ?? [])) {
    const key = String(attribute.key ?? '')
    if (!key || values[key] != null) continue
    const text = readIndexed(row.doc, defs, key)
    if (!text) continue
    if (attribute.language_dependent) values[key] = { [language]: text }
    else values[key] = text
  }
  return {
    id: row.id,
    key: row.key,
    type: row.type,
    version: versionOf({ version: row.version }),
    values,
    links: [],
    [LIST_PREVIEW]: true,
  }
}

export function seedObjectListPreview(queryClient: QueryClient, preview: Json): void {
  const id = String(preview.id ?? '')
  if (!id) return
  const queryKey = ['object', id] as const
  const existing = queryClient.getQueryData<Json>(queryKey)
  if (existing && !isListPreview(existing) && versionOf(existing) >= versionOf(preview)) return
  queryClient.setQueryData(queryKey, preview)
}

export async function loadObjectDetail(queryClient: QueryClient, id: string): Promise<Json> {
  try {
    return reconcileObjectWrite(id, await api.get('/v1/objects/{id}', { params: { path: { id } } }))
  } catch (reason) {
    if (objectGone(reason)) markObjectGone(queryClient, id)
    throw reason
  }
}

export function prefetchObjectDetails(queryClient: QueryClient, ids: string[]): void {
  const unique = [...new Set(ids.filter(Boolean))]
  for (const id of unique) {
    const state = queryClient.getQueryState(['object', id])
    if (state?.fetchStatus === 'fetching') continue
    if (state?.data && !isListPreview(state.data)) continue
    void queryClient.prefetchQuery({
      queryKey: ['object', id],
      queryFn: () => loadObjectDetail(queryClient, id),
      ...objectFetchQueryOptions(),
    })
  }
}

export const OBJECT_NAV_DEBOUNCE_MS = 100
export const OBJECT_PREFETCH_RADIUS = 3