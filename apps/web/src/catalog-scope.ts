/** Catalog the in-flight API call should read and write. Master stays on `/v1`. */

let active = 'master'

export function catalogKeyOf(state: { catalog?: unknown } | null | undefined): string {
  const value = state?.catalog
  return typeof value === 'string' && value.length > 0 ? value : 'master'
}

/**
 * Runs `fn` so the API fetch wrapper scopes it to `catalog`.
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
