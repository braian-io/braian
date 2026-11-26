import type { Json } from './api'
import { effectiveFields } from './model-view'

export type DetailFieldSplit = {
  primaryKeys: string[]
  moreKeys: string[]
}

/**
 * Split the keys present on an object into the Detail fields shown by default
 * and the ones behind "Show more fields". Unknown keys stay primary so no data
 * disappears when an attribute definition is missing.
 */
export function splitDetailKeys(defs: Json | undefined, keys: string[]): DetailFieldSplit {
  const hidden = new Set<string>()
  for (const attribute of (defs?.attributes as Json[] | undefined) ?? []) {
    if (attribute.show_by_default !== false) continue
    const key = String(attribute.key ?? '')
    if (key) hidden.add(key)
    const id = String(attribute.id ?? '')
    if (id) hidden.add(id)
  }
  const primaryKeys: string[] = []
  const moreKeys: string[] = []
  for (const key of keys) {
    if (hidden.has(key)) moreKeys.push(key)
    else primaryKeys.push(key)
  }
  return { primaryKeys, moreKeys }
}

/** Object membership is `{ structureKey: groupKey }`. */
export function groupMemberships(groups: unknown): Array<{ structure: string; group: string }> {
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) return []
  return Object.entries(groups as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '')
    .map(([structure, group]) => ({ structure, group }))
}

/**
 * Attribute keys that apply to an object: its type, its groups, and ancestor
 * groups. Empty inherited fields are included so Detail can show them before
 * a value is stored.
 */
export function applicableDetailKeys(
  defs: Json | undefined,
  typeKey: string,
  groups: unknown,
  language = 'en',
): string[] {
  return effectiveFields(defs, typeKey, groupMemberships(groups), language).map((field) => field.key)
}
