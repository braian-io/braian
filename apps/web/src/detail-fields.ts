import type { Json } from './api'

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
