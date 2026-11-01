/** Active catalog key for in-flight API calls. Master stays on `/v1`. */

import {
  MASTER_CATALOG_ID,
  catalogRefOf,
  effectiveCatalogId,
  viewCatalogOverrideRef,
  type CatalogRef,
} from './catalog-ref'

let active = 'master'

/**
 * Resolves the catalog *key* for a view given workspace catalog + id→key map.
 * Uses the shared effectiveCatalogId resolver; never treats legacy state.catalog
 * as an override.
 */
export function catalogKeyOf(
  state: unknown,
  workspaceCatalog?: CatalogRef | null,
  idToKey?: Record<string, string>,
): string {
  const id = effectiveCatalogId(viewCatalogOverrideRef(state), workspaceCatalog ?? null)
  if (idToKey?.[id]) return idToKey[id]
  if (id === MASTER_CATALOG_ID) return 'master'
  return idToKey?.[id] || 'master'
}

export function workspaceCatalogRef(workspace: unknown): CatalogRef | null {
  if (!workspace || typeof workspace !== "object") return null
  return catalogRefOf((workspace as { catalog?: unknown }).catalog)
}

/**
 * Runs `fn` so the API fetch wrapper scopes it to `catalog` key.
 * The catalog is read synchronously when the request starts, before the first await.
 */
export function inCatalog<T>(catalog: string, fn: () => Promise<T>): Promise<T> {
  const previous = active
  active = catalog || 'master'
  let pending: Promise<T>
  try {
    pending = fn()
  } finally {
    active = previous
  }
  return pending
}

export function activeCatalog(): string {
  return active
}

/** Prefixes a data path when the active catalog is not the master. */
export function scopePath(pathname: string): string {
  if (!active || active === 'master') return pathname
  if (!pathname.startsWith('/v1/')) return pathname
  if (pathname.startsWith('/v1/catalogs')) return pathname
  if (pathname === '/v1/me' || pathname === '/v1/openapi.json' || pathname.startsWith('/v1/login')) {
    return pathname
  }
  return `/v1/catalogs/${active}${pathname.slice(3)}`
}
