import { catalogName, textValue, type Json } from './api'
import { typeLabel } from './chips'
import { score, type FrecencyEntry } from './frecency'
import { copy, uiLanguage } from './i18n'
import { frecencyId, paletteMatchScore, recentSlice, type PaletteItem } from './palette-model'

const standardKeys = new Set(['number', 'name', 'created_at', 'updated_at', 'updated_by'])

export type LinkDirection = 'out' | 'in'

export type LinkField = {
  key: string
  label: string
  kind: string
  form: string
  languageDependent: boolean
  options: Array<{ code: string; label: string }>
  units: string[]
}

export type LinkChoice = {
  linkType: string
  direction: LinkDirection
  label: string
  fields: LinkField[]
}

export type LinkHit = {
  id: string
  key: string
  name: string
  typeKey: string
}

export function choiceValue(choice: LinkChoice) {
  return `${choice.linkType}:${choice.direction}`
}

/** Side label, with the direction when two choices share it. */
export function choiceLabel(choice: LinkChoice, all: LinkChoice[]) {
  const shared = all.filter((item) => item.label === choice.label).length > 1
  if (!shared) return choice.label
  const side = choice.direction === 'out' ? copy.linkFromHere : copy.linkToHere
  return `${choice.label} · ${side}`
}

export function allowedLinks(defs: Json | undefined, sourceType: string, targetType: string): LinkChoice[] {
  if (!sourceType || !targetType) return []
  const types = ((defs?.types as Json[]) ?? []).filter((item) => item.kind === 'link')
  const choices: LinkChoice[] = []
  for (const item of types) {
    const key = String(item.key ?? '')
    const spec = item.link as Json | undefined
    const from = idList(defs, spec?.from_types)
    const to = idList(defs, spec?.to_types)
    const fields = fieldsFor(defs, item)
    if (from.includes(sourceType) && to.includes(targetType)) {
      choices.push({
        linkType: key,
        direction: 'out',
        label: labelOf(spec?.to_label, key),
        fields,
      })
    }
    if (to.includes(sourceType) && from.includes(targetType)) {
      choices.push({
        linkType: key,
        direction: 'in',
        label: labelOf(spec?.from_label, key),
        fields,
      })
    }
  }
  return choices
}

export function preferredChoice(choices: LinkChoice[], preferred?: { linkType: string; direction: LinkDirection }) {
  if (choices.length === 0) return null
  const match = preferred
    ? choices.find((item) => item.linkType === preferred.linkType && item.direction === preferred.direction)
    : undefined
  return match ?? choices[0] ?? null
}

/** Search document as a picker row. The title is the name; type and id stay secondary. */
export function linkHitFromDocument(row: Json, defs?: Json): LinkHit | null {
  const id = String(row.id ?? '')
  if (!id) return null
  const typeKey = String(row.type_key ?? row.type ?? '')
  const key = String(row.key ?? '')
  const name = catalogName(row, defs) || key || id
  return { id, key: key || id, name, typeKey }
}

export function linkPaletteItem(hit: LinkHit, defs?: Json): PaletteItem {
  const type = hit.typeKey ? typeLabel(defs, hit.typeKey, uiLanguage) : ''
  return {
    id: `hit:${hit.id}`,
    sourceId: hit.id,
    group: 'search',
    title: hit.name,
    subtitle: hit.key,
    typeKey: hit.typeKey,
    entity: true,
    keywords: [hit.key, hit.id, type, hit.typeKey].filter(Boolean),
    chips: type ? [{ text: type, tone: 'neutral' }] : [],
  }
}

/**
 * Empty query: recent objects, same frecency order as Ctrl+K.
 * A query reorders Typesense hits with the palette rank, then frecency.
 * A hit Typesense returned stays in the list even when the local score is 0.
 */
export function linkPickerRows(input: {
  hits: LinkHit[]
  query: string
  frecency: Record<string, FrecencyEntry>
  memory?: PaletteItem[]
  defs?: Json
  now?: number
}): PaletteItem[] {
  const now = input.now ?? Date.now()
  const needle = input.query.trim().toLowerCase()
  const hits = input.hits.map((hit) => linkPaletteItem(hit, input.defs))
  if (!needle) {
    const remembered = (input.memory ?? []).filter((item) => item.id.startsWith('hit:') || item.group === 'search')
    return recentSlice([...hits, ...remembered], input.frecency, 8)
  }
  return hits
    .map((item, index) => ({ item, index, rank: paletteMatchScore(item, needle) }))
    .sort((left, right) => {
      if (left.rank !== right.rank) return right.rank - left.rank
      const frec = score(input.frecency[frecencyId(right.item)], now) - score(input.frecency[frecencyId(left.item)], now)
      if (frec !== 0) return frec
      return left.index - right.index
    })
    .map((entry) => entry.item)
}

/** Wire values for the link attributes the person filled in. Empty fields are omitted. */
export function linkFieldValues(fields: LinkField[], draft: Record<string, string>): Json {
  const values: Json = {}
  for (const field of fields) {
    const raw = (draft[field.key] ?? '').trim()
    if (!raw) continue
    if (field.kind === 'number' || field.kind === 'range') {
      values[field.key] = field.units.length > 0 ? { value: raw, unit: field.units[0] } : { value: raw }
      continue
    }
    if (field.kind === 'boolean') {
      if (raw === 'true' || raw === 'false') values[field.key] = raw === 'true'
      continue
    }
    if (field.languageDependent) {
      values[field.key] = { [uiLanguage]: raw }
      continue
    }
    values[field.key] = raw
  }
  return values
}

function fieldsFor(defs: Json | undefined, linkType: Json): LinkField[] {
  const attributes = (defs?.attributes as Json[] | undefined) ?? []
  const lists = (defs?.value_lists as Json[] | undefined) ?? []
  const families = (defs?.unit_families as Json[] | undefined) ?? []
  const ids = new Set(((linkType.attributes as unknown[]) ?? []).map(String))
  const fields: LinkField[] = []
  for (const attribute of attributes) {
    if (!ids.has(String(attribute.id ?? ''))) continue
    const key = String(attribute.key ?? '')
    if (!key || standardKeys.has(key)) continue
    const kind = (attribute.kind as Json) ?? {}
    const type = String(kind.type ?? 'text')
    const listKey = String(kind.list ?? '')
    const familyId = String(kind.unit_family ?? '')
    fields.push({
      key,
      label: textValue(attribute.labels as Json, uiLanguage) || key,
      kind: type,
      form: String(kind.form ?? ''),
      languageDependent: Boolean(attribute.language_dependent),
      options: optionsFor(lists, listKey),
      units: unitsFor(families, familyId),
    })
  }
  return fields
}

function optionsFor(lists: Json[], key: string) {
  const list = lists.find((item) => item.key === key)
  return ((list?.options as Json[]) ?? []).map((option) => ({
    code: String(option.code),
    label: textValue(option.labels, uiLanguage) || String(option.code),
  }))
}

function unitsFor(families: Json[], id: string) {
  const family = families.find((item) => item.id === id || item.key === id)
  return ((family?.units as Json[]) ?? []).map((unit) => String(unit.code))
}

function idList(defs: Json | undefined, ids: unknown) {
  const types = (defs?.types as Json[]) ?? []
  return ((ids as unknown[]) ?? []).map((id) => {
    const match = types.find((item) => String(item.id) === String(id))
    return String(match?.key ?? id)
  })
}

function labelOf(label: unknown, fallback: string) {
  const map = (label as Json | undefined)?.labels
  return textValue(map as Json, uiLanguage) || textValue(map as Json, 'en') || fallback
}
