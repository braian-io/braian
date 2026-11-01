import type { Json } from './api'
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

/** Header / demo label for a type-sourced object table. Empty when unbound. */
export function viewSourceLabel(
  view: { type: string; state?: Json },
  types: TypeName[],
): string {
  if (view.type !== 'object_table') return ''
  const bound = typeOfView(view, types)
  if (!bound) return ''
  return copy.allOfType.replace('{type}', bound.plural)
}

export function isObjectTableView(view: { type: string }) {
  return view.type === 'object_table'
}
