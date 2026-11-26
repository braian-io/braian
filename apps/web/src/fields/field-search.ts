import type { FieldDef } from './qualifiers'

/** Lowercase haystack for Select fields filtering, including the full group path. */
export function fieldHaystack(field: FieldDef): string {
  return `${field.name} ${field.typeLabel} ${field.source ?? ''}`.toLowerCase()
}

export function fieldMatchesQuery(field: FieldDef, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return fieldHaystack(field).includes(needle)
}