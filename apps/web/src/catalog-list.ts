import { useQuery } from '@tanstack/react-query'
import { MASTER_CATALOG_ID } from './catalog-ref'

export type CatalogListRow = { id?: string; key?: string; name?: string; kind?: string }

async function fetchCatalogs(): Promise<CatalogListRow[]> {
  const response = await fetch('/v1/catalogs', { credentials: 'include' })
  if (!response.ok) {
    throw new Error((await response.text()) || `catalogs ${response.status}`)
  }
  const body = await response.json()
  if (!Array.isArray(body)) {
    throw new Error('catalogs response was not an array')
  }
  return body as CatalogListRow[]
}

/** Shared catalogs list. Pass enabled=false until the session is authenticated —
 * otherwise a 401 on the login screen caches an empty list (retry:false) and the
 * header/palette pickers only show Master. */
export function useCatalogsQuery(enabled = true) {
  return useQuery({
    queryKey: ['catalogs'],
    queryFn: fetchCatalogs,
    staleTime: 30_000,
    enabled: enabled && typeof window !== 'undefined',
  })
}

export function useCatalogIdToKey(enabled = true): Record<string, string> {
  const catalogs = useCatalogsQuery(enabled)
  const map: Record<string, string> = { [MASTER_CATALOG_ID]: 'master' }
  for (const row of catalogs.data ?? []) {
    if (row.id && row.key) map[row.id] = row.key
  }
  return map
}

export function useCatalogNamesById(enabled = true): Record<string, string> {
  const catalogs = useCatalogsQuery(enabled)
  const map: Record<string, string> = {}
  for (const row of catalogs.data ?? []) {
    if (row.id) map[row.id] = row.name || row.key || row.id
  }
  return map
}
