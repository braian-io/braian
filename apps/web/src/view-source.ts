import type { Json } from './api'
import { catalogOverrideDiffers, viewCatalogOverrideRef, type CatalogRef } from './catalog-ref'
import { copy } from './i18n'
import { typeOfView, type TypeName } from './type-labels'

/** Persist "all objects of a type" on an object_table view (Notion 103 PR 1). */
export function applyTypeSource(state: Json | undefined, type: TypeName): Json {
  return {
    ...(state ?? {}),
    object_type: type.id,
    type_key: type.key,
  }
}

/**
 * Header label for a type-sourced object table.
 * Appends " · {Catalog}" only when catalogOverride differs from the workspace catalog.
 */
export function viewSourceLabel(
  view: { type: string; state?: Json },
  types: TypeName[],
  workspaceCatalog?: CatalogRef | null,
  catalogNamesById?: Record<string, string>,
): string {
  if (view.type !== 'object_table') return ''
  const bound = typeOfView(view, types)
  if (!bound) return ''
  const base = copy.allOfType.replace('{type}', bound.plural)
  const override = viewCatalogOverrideRef(view.state)
  if (!catalogOverrideDiffers(override, workspaceCatalog ?? null) || !override) return base
  const name = catalogNamesById?.[override.catalogId] || override.catalogId
  return `${base} · ${name}`
}

export function isObjectTableView(view: { type: string }) {
  return view.type === 'object_table'
}
