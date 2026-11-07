import { api } from './api'
import { inCatalog } from './catalog-scope'
import type { KeyedId } from './url-public'

const PAGE = 500
/** Contains-matches, not exact keys. A full SKU stays on the first page. */
const MAX_PAGES = 8

export type ObjectKeyPage = { rows: KeyedId[]; complete: boolean }

/**
 * Exact object keys in one catalog (and type, when `typeKey` is set).
 * Uses `GET /v1/objects`, which reads Postgres, so a rename is visible
 * without waiting for the search index. The list is a contains match;
 * callers keep rows whose key is identical.
 * `complete` is false when the cap is hit while more rows exist — the
 * caller must not guess.
 */
export async function listObjectsWithKey(
  catalogKey: string,
  key: string,
  typeKey?: string | null,
): Promise<ObjectKeyPage> {
  const rows: KeyedId[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const body = await inCatalog(catalogKey || 'master', () => api.get('/v1/objects', {
      params: {
        query: {
          q: key,
          limit: PAGE,
          ...(typeKey ? { type: typeKey } : {}),
          ...(cursor ? { cursor } : {}),
        },
      },
    }))
    for (const row of body.objects ?? []) {
      if (row.key === key && row.id) rows.push({ id: row.id, key: row.key })
    }
    if (!body.next_cursor) return { rows, complete: true }
    cursor = body.next_cursor
  }
  return { rows, complete: false }
}
