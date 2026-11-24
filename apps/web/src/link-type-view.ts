import type { Json } from './api'
import { textValue } from './api'

export type LinkTypeRow = {
  id: string
  key: string
  fromType: string
  toType: string
  fromLabel: string
  toLabel: string
  fromCardinality: 'one' | 'many'
  toCardinality: 'one' | 'many'
}

export function entityTypeKeys(defs: Json | undefined): string[] {
  return ((defs?.types as Json[]) ?? [])
    .filter((item) => item.kind !== 'link')
    .map((item) => String(item.key ?? ''))
    .filter(Boolean)
}

export function typeKeyFromToken(defs: Json | undefined, token: unknown): string {
  const text = String(token ?? '')
  if (!text) return ''
  const hit = ((defs?.types as Json[]) ?? []).find(
    (item) => String(item.id ?? '') === text || String(item.key ?? '') === text,
  )
  return String(hit?.key ?? text)
}

export function linkTypeRows(defs: Json | undefined, language = 'en'): LinkTypeRow[] {
  return ((defs?.types as Json[]) ?? [])
    .filter((item) => item.kind === 'link')
    .map((item) => rowFromType(item, defs, language))
    .filter((row) => row.key)
}

function rowFromType(item: Json, defs: Json | undefined, language: string): LinkTypeRow {
  const key = String(item.key ?? '')
  const link = (item.link as Json | undefined) ?? {}
  const fromTypes = (link.from_types as unknown[]) ?? []
  const toTypes = (link.to_types as unknown[]) ?? []
  const fromLabelSpec = (link.from_label as Json | undefined) ?? {}
  const toLabelSpec = (link.to_label as Json | undefined) ?? {}
  return {
    id: key,
    key,
    fromType: typeKeyFromToken(defs, fromTypes[0]),
    toType: typeKeyFromToken(defs, toTypes[0]),
    fromLabel: textValue(fromLabelSpec.labels as Json, language) || String(fromLabelSpec.key ?? ''),
    toLabel: textValue(toLabelSpec.labels as Json, language) || String(toLabelSpec.key ?? ''),
    fromCardinality: String(link.from_cardinality ?? 'many') === 'one' ? 'one' : 'many',
    toCardinality: String(link.to_cardinality ?? 'many') === 'one' ? 'one' : 'many',
  }
}