import { groupKeyOf, typeKeyOf } from './assortment-filter'
import type { Json } from './api'
import { groupsClause, groupSubtreeTokens } from './view-source'

/** Search filter for an object table.
 *
 * The table stays on the view's type. A selected group narrows that type;
 * a selection cannot switch the table to another type. Stored ids are mapped
 * back to the current keys the index still uses.
 */
export function objectTableFilter(typeKey: string, group: string | null, defs?: Json): string {
  const parts: string[] = []
  if (typeKey) parts.push(`type_key:=${typeKeyOf(typeKey, defs)}`)
  if (group) {
    const token = groupKeyOf(group, defs)
    const split = token.indexOf(':')
    parts.push(split > 0
      ? groupsClause(groupSubtreeTokens(token.slice(0, split), token.slice(split + 1), defs))
      : `groups:=${token}`)
  }
  return parts.join(' && ')
}

/** Append one attribute-path clause. The API turns the path into an index field. */
export function appendPathFilter(base: string, path: string, value: string): string {
  const clause = `${path}:=${value}`
  return [base.trim(), clause].filter(Boolean).join(' && ')
}
