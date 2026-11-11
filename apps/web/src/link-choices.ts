import { catalogName, textValue, type Json } from './api'
import { typeLabel } from './chips'
import { score, type FrecencyEntry } from './frecency'
import { copy, uiLanguage } from './i18n'
import { pluralOf } from './type-labels'
import { frecencyId, paletteMatchScore, recentSlice, type PaletteItem } from './palette-model'

const standardKeys = new Set(['number', 'name', 'created_at', 'updated_at', 'updated_by'])

export type LinkDirection = 'out' | 'in'

export type LinkField = {
  key: string
  attributeId?: string
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
  /** Type keys the peer must have for this relation. */
  targetTypes?: string[]
  fields: LinkField[]
  fromCardinality?: string
  toCardinality?: string
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
        targetTypes: to,
        fields,
        fromCardinality: String(spec?.from_cardinality ?? 'many'),
        toCardinality: String(spec?.to_cardinality ?? 'many'),
      })
    }
    if (to.includes(sourceType) && from.includes(targetType)) {
      choices.push({
        linkType: key,
        direction: 'in',
        label: labelOf(spec?.from_label, key),
        targetTypes: from,
        fields,
        fromCardinality: String(spec?.from_cardinality ?? 'many'),
        toCardinality: String(spec?.to_cardinality ?? 'many'),
      })
    }
  }
  return choices
}

/**
 * Link types that work for every target type against the same source.
 * A mixed drag only offers a type the whole drop can use.
 */
export function linksForEnds(defs: Json | undefined, sourceType: string, targetTypes: string[]): LinkChoice[] {
  const unique = [...new Set(targetTypes.filter(Boolean))]
  if (!sourceType || unique.length === 0) return []
  let choices = allowedLinks(defs, sourceType, unique[0] ?? '')
  for (const type of unique.slice(1)) {
    const next = allowedLinks(defs, sourceType, type)
    choices = choices
      .filter((choice) =>
        next.some((item) => item.linkType === choice.linkType && item.direction === choice.direction),
      )
      .map((choice) => {
        const matching = next.filter((item) => item.linkType === choice.linkType && item.direction === choice.direction)
        return {
          ...choice,
          targetTypes: [...new Set([...(choice.targetTypes ?? []), ...matching.flatMap((item) => item.targetTypes ?? [])])],
        }
      })
  }
  return choices
}

/** Short reason for the drag preview when the pair has no shared link type. */
export function linkDragDenial(defs: Json | undefined, anchorType: string, draggedTypes: string[]): string | null {
  if (!defs || !anchorType || draggedTypes.length === 0) return null
  if (linksForEnds(defs, anchorType, draggedTypes).length > 0) return null
  return linkCantText(defs, anchorType, draggedTypes)
}

/** Dialog copy: both type names, then what each type is allowed to link to. */
export function linkPairExplanation(defs: Json | undefined, anchorType: string, draggedTypes: string[]): string {
  if (!defs || !anchorType) return ''
  const targets = [...new Set(draggedTypes.filter(Boolean))]
  if (targets.length === 0) return ''
  const head = linkCantText(defs, anchorType, targets)
  const from = canSentence(defs, anchorType)
  const rest = targets.filter((type) => type !== anchorType).map((type) => canSentence(defs, type))
  return [`${head}.`, from, ...rest].filter(Boolean).join(' ')
}

type LinkEnd = { id: string; name?: string; key?: string }

/**
 * `PROD-CHEDDAR · Mature cheddar — Product — ART-CHED-400 · Mature cheddar 400 g`,
 * then `+N more`. The relation label makes the direction clear without a bare arrow.
 */
export function linkEndsSummary(source: LinkEnd, peers: LinkEnd[], label?: string): string {
  const shown = peers.slice(0, 5).map(linkEndLabel)
  const extra = peers.length - shown.length
  const right = extra > 0
    ? `${shown.join(', ')} ${copy.linkMore.replace('{count}', String(extra))}`
    : shown.join(', ')
  const middle = label ? copy.linkEndsRelation.replace('{label}', label) : copy.linkEndsArrow
  return copy.linkEnds
    .replace('{left}', linkEndLabel(source))
    .replace('{middle}', middle)
    .replace('{right}', right)
}

/** Key and name, never an id that happens to be a UUID. */
export function linkEndLabel(item: LinkEnd) {
  const key = visibleText(item.key)
  const name = visibleText(item.name)
  if (key && name && key !== name) return `${key} · ${name}`
  return name || key
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A UUID is an identity, not a label. Hide one if an upstream sent it as text. */
export function visibleText(value: unknown) {
  const text = String(value ?? '').trim()
  return uuidPattern.test(text) ? '' : text
}

/** Only rows the relation can link to, minus the source and its existing peers. */
export function filterLinkCandidates<T extends { id: string; typeKey?: string }>(
  items: T[],
  targetTypes: string[] | undefined,
  exclude: Set<string>,
) {
  const allowed = targetTypes && targetTypes.length > 0 ? new Set(targetTypes) : null
  return items.filter((item) => !exclude.has(item.id) && (!allowed || (item.typeKey != null && allowed.has(item.typeKey))))
}

/** Peers already linked to the source for exactly this relation and direction. */
export function existingLinkPeerIds(
  sides: Array<{ link_type: string; direction: string; links?: Array<{ peer_id: string }> }> | undefined,
  linkType: string | undefined,
  direction: LinkDirection | undefined,
) {
  if (!linkType || !direction) return []
  const ids: string[] = []
  for (const side of sides ?? []) {
    if (side.link_type !== linkType || side.direction !== direction) continue
    for (const link of side.links ?? []) {
      if (link.peer_id) ids.push(String(link.peer_id))
    }
  }
  return [...new Set(ids)]
}

/** `3 articles`, or `1 object` when the dragged rows do not share a type. */
export function linkCountNoun(count: number, defs: Json | undefined, typeKey: string) {
  if (!typeKey) return count === 1 ? copy.linkOneObject : copy.linkManyObjects.replace('{count}', String(count))
  const word = (count === 1 ? typeLabel(defs, typeKey, uiLanguage) : pluralOf(defs, typeKey, uiLanguage) || typeKey).toLowerCase()
  return count === 1 ? `1 ${word}` : `${count} ${word}`
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
  const key = visibleText(row.key)
  const name = visibleText(catalogName(row, defs)) || key
  return { id, key, name, typeKey }
}

export function linkPaletteItem(hit: LinkHit, defs?: Json): PaletteItem {
  const type = hit.typeKey ? typeLabel(defs, hit.typeKey, uiLanguage) : ''
  return {
    id: `hit:${hit.id}`,
    sourceId: hit.id,
    group: 'search',
    title: hit.name || type || hit.key || copy.nodeObject,
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

export function linkFieldErrors(fields: LinkField[], draft: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    if (field.kind !== 'number' && field.kind !== 'range') continue
    const raw = (draft[field.key] ?? '').trim()
    if (!raw) continue
    if (!Number.isFinite(Number(raw))) errors[field.key] = copy.linkFieldNumber
  }
  return errors
}

export function linkConstrainedType(
  choice: LinkChoice,
  sourceType: string,
  peerType: string,
): { type: string; other: string } | null {
  const sourceIsFrom = choice.direction === 'out'
  const sourceOne = sourceIsFrom ? choice.fromCardinality === 'one' : choice.toCardinality === 'one'
  const peerOne = sourceIsFrom ? choice.toCardinality === 'one' : choice.fromCardinality === 'one'
  if (sourceOne) return { type: sourceType, other: peerType }
  if (peerOne) return { type: peerType, other: sourceType }
  return null
}

export function linkCardinalityMessage(
  defs: Json | undefined,
  choice: LinkChoice,
  sourceType: string,
  peerType: string,
): string {
  const end = linkConstrainedType(choice, sourceType, peerType)
  if (!end) return copy.linkCardinalityGeneric
  return copy.linkCardinalityConflict
    .replace('{type}', linkTypeName(defs, end.type))
    .replace('{other}', linkTypeName(defs, end.other))
}

export function linkTypeName(defs: Json | undefined, typeKey: string) {
  return (typeLabel(defs, typeKey, uiLanguage) || typeKey).toLowerCase()
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
      attributeId: String(attribute.id ?? ''),
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

function linkCantText(defs: Json, anchorType: string, draggedTypes: string[]) {
  const targets = [...new Set(draggedTypes.filter(Boolean))]
  const to = targets.length === 1
    ? typeWord(defs, targets[0] ?? '')
    : targets.map((type) => typeWord(defs, type)).join(', ')
  return copy.linkCant.replace('{from}', typeWord(defs, anchorType)).replace('{to}', to)
}

function canSentence(defs: Json, typeKey: string) {
  const peers = linkPeerTypes(defs, typeKey).map((type) => typeWord(defs, type))
  const from = typeWord(defs, typeKey)
  if (peers.length === 0) return copy.linkCanNothing.replace('{from}', from)
  return copy.linkCan.replace('{from}', from).replace('{to}', peers.join(', '))
}

function linkPeerTypes(defs: Json, typeKey: string) {
  const entities = ((defs.types as Json[]) ?? []).filter((item) => item.kind !== 'link')
  const keys: string[] = []
  for (const entity of entities) {
    const key = String(entity.key ?? '')
    if (!key) continue
    if (allowedLinks(defs, typeKey, key).length > 0) keys.push(key)
  }
  return keys
}

function typeWord(defs: Json, typeKey: string) {
  return pluralOf(defs, typeKey, uiLanguage) || typeLabel(defs, typeKey, uiLanguage) || typeKey
}

function labelOf(label: unknown, fallback: string) {
  const map = (label as Json | undefined)?.labels
  return textValue(map as Json, uiLanguage) || textValue(map as Json, 'en') || fallback
}
