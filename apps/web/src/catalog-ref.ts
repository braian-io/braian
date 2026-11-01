/** Structured catalog pointer. Labels are derived for display, never stored. */

export const MASTER_CATALOG_ID = '018f1000-0000-7000-8000-000000000001'
export const SAP_CATALOG_ID = '018f1000-0000-7000-8000-000000000002'

export type CatalogRef = { catalogId: string }

/** Parse a stored ref. Rejects bare strings / labels. */
export function catalogRefOf(value: unknown): CatalogRef | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = (value as { catalogId?: unknown }).catalogId
  if (typeof id !== 'string' || id.length === 0) return null
  return { catalogId: id }
}

/**
 * ONE resolver (web + Rust + agent must match):
 * view.catalogOverride ?? workspace.catalog ?? defaultCatalog
 *
 * Legacy view.state.catalog (string key) is NOT an override — those views follow
 * the workspace. Only explicit catalogOverride: { catalogId } pins a view.
 */
export function effectiveCatalogId(
  viewOverride: CatalogRef | null | undefined,
  workspaceCatalog: CatalogRef | null | undefined,
  defaultCatalogId: string = MASTER_CATALOG_ID,
): string {
  if (viewOverride?.catalogId) return viewOverride.catalogId
  if (workspaceCatalog?.catalogId) return workspaceCatalog.catalogId
  return defaultCatalogId || MASTER_CATALOG_ID
}

/** Explicit override from view state, or null when the view follows the workspace. */
export function viewCatalogOverrideRef(state: unknown): CatalogRef | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  return catalogRefOf((state as { catalogOverride?: unknown }).catalogOverride)
}

/** True when the view pins a catalog that differs from the workspace global. */
export function catalogOverrideDiffers(
  viewOverride: CatalogRef | null | undefined,
  workspaceCatalog: CatalogRef | null | undefined,
  defaultCatalogId: string = MASTER_CATALOG_ID,
): boolean {
  if (!viewOverride?.catalogId) return false
  const global = workspaceCatalog?.catalogId || defaultCatalogId || MASTER_CATALOG_ID
  return viewOverride.catalogId !== global
}

export function catalogRef(catalogId: string): CatalogRef {
  return { catalogId }
}
