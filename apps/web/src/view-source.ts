import type { Json } from './api'
import { catalogOverrideDiffers, viewCatalogOverrideRef, type CatalogRef } from './catalog-ref'
import { copy } from './i18n'
import { typeOfView, type TypeName } from './type-labels'

export type PeerSelection = 'row' | 'node'
export type PeerSourceRef = { kind: 'peer'; viewId: string; selection: PeerSelection; linkType?: string }

export type SourcePin =
  | { selection: 'node'; structureKey: string; groupKey: string; caption?: string }
  | { selection: 'row'; ids: string[]; caption?: string }

function stateRecord(state: Json | undefined): Record<string, unknown> {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {}
  return { ...(state as Record<string, unknown>) }
}

/** Drop a source lock and any frozen peer selection snapshot. */
export function stripSourceLock(state: Json | undefined): Json {
  const next = stateRecord(state)
  delete next.sourceLocked
  delete next.sourcePin
  return next
}

/** True when automatic peer retargeting and live follow are paused for this view. */
export function isSourceLocked(state: Json | undefined): boolean {
  return stateRecord(state).sourceLocked === true
}

/** Frozen peer selection used while `sourceLocked` is true. */
export function sourcePinOf(state: Json | undefined): SourcePin | null {
  const raw = stateRecord(state).sourcePin
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (record.selection === 'node') {
    const structureKey = typeof record.structureKey === 'string' ? record.structureKey : ''
    const groupKey = typeof record.groupKey === 'string' ? record.groupKey : ''
    if (!structureKey || !groupKey) return null
    const caption = typeof record.caption === 'string' ? record.caption : undefined
    return { selection: 'node', structureKey, groupKey, ...(caption ? { caption } : {}) }
  }
  if (record.selection === 'row') {
    const ids = Array.isArray(record.ids) ? record.ids.map(String).filter(Boolean) : []
    if (ids.length === 0) return null
    const caption = typeof record.caption === 'string' ? record.caption : undefined
    return { selection: 'row', ids, ...(caption ? { caption } : {}) }
  }
  return null
}

export function withSourceLock(state: Json | undefined, locked: boolean, pin: SourcePin | null): Json {
  const next = stripSourceLock(state)
  if (!locked) return next
  return { ...next, sourceLocked: true, ...(pin ? { sourcePin: pin } : {}) }
}

/** Snapshot the live peer selection when the user locks the view. */
export function buildSourcePin(
  peer: PeerSourceRef,
  node: { structureKey: string; groupKey: string } | null,
  rows: Array<{ id: string }>,
  caption: string,
): SourcePin | null {
  if (peer.selection === 'node') {
    if (!node?.structureKey || !node.groupKey) return null
    return { selection: 'node', structureKey: node.structureKey, groupKey: node.groupKey, caption }
  }
  const ids = rows.map((row) => row.id).filter(Boolean)
  if (ids.length === 0) return null
  return { selection: 'row', ids, caption }
}

/** Persist "all objects of a type" on an object_table view (Notion 103 PR 1). */
export function applyTypeSource(state: Json | undefined, type: TypeName): Json {
  const base = stripSourceLock(state)
  return {
    ...base,
    object_type: type.id,
    type_key: type.key,
    source: { kind: 'all' },
  }
}

export function isExplicitAllSource(state: Json | undefined): boolean {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false
  const raw = state.source
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  return (raw as Json).kind === 'all'
}

/** Drop an explicit all-of-type marker so session.group filters apply again. */
export function clearExplicitAllSource(state: Json | undefined): Json {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {}
  const next = { ...(state as Json) }
  delete next.source
  return next
}

/**
 * Persist a live source: another view's selected row or tree node.
 * The selection itself is read from the UI registry, never copied into state.
 */
export function applyPeerSource(
  state: Json | undefined,
  viewId: string,
  selection: PeerSelection,
  linkType?: string,
): Json {
  const base = stripSourceLock(state)
  return {
    ...base,
    source: {
      kind: 'peer',
      viewId,
      selection,
      ...(linkType ? { linkType } : {}),
    },
  }
}

/** Read the explicit peer source, or null for all-of-type. */
export function peerSourceOf(state: Json | undefined): PeerSourceRef | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const raw = state.source
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Json
  if (record.kind !== 'peer') return null
  const viewId = typeof record.viewId === 'string' ? record.viewId : ''
  if (!viewId) return null
  const linkType = typeof record.linkType === 'string' && record.linkType ? record.linkType : undefined
  return {
    kind: 'peer',
    viewId,
    selection: record.selection === 'node' ? 'node' : 'row',
    ...(linkType ? { linkType } : {}),
  }
}

/**
 * True when pointing `targetViewId` at `sourceViewId` would close a peer-source
 * loop (including a view sourcing itself). `sourceOf` returns the view a view
 * currently follows, if any.
 */
export function wouldCreateCycle(
  sourceViewId: string,
  targetViewId: string,
  sourceOf: (viewId: string) => string | undefined | null = () => undefined,
): boolean {
  if (!sourceViewId || !targetViewId) return false
  let current: string | undefined | null = sourceViewId
  const seen = new Set<string>()
  while (current) {
    if (current === targetViewId) return true
    if (seen.has(current)) return false
    seen.add(current)
    current = sourceOf(current)
  }
  return false
}

export type PeerEmptyKind = 'missing-source' | 'no-selection' | 'no-linked'

export type PeerEmptyState = {
  kind: PeerEmptyKind
  text: string
  showAll: string
}

/**
 * The empty state a peer-sourced table shows instead of blank rows (Notion 103
 * decision 6). A peer source never falls back to every object of the type.
 * `linkedCount` is null while the link lookup is still unsettled.
 */
export function peerEmptyState(input: {
  source: PeerSourceRef | null
  sourceView?: { title?: string } | null
  targetType?: Pick<TypeName, 'plural'> | null
  hasSelection: boolean
  selectionLabel?: string | null
  linkedCount?: number | null
}): PeerEmptyState | null {
  if (!input.source) return null
  const type = input.targetType?.plural || copy.objects
  const showAll = copy.showAll
  if (!input.sourceView) return { kind: 'missing-source', text: copy.sourceMissing, showAll }
  if (!input.hasSelection) {
    return {
      kind: 'no-selection',
      text: copy.selectRowIn.replace('{view}', input.sourceView.title ?? ''),
      showAll,
    }
  }
  if (input.linkedCount === 0) {
    const object = (input.selectionLabel ?? '').trim()
    return {
      kind: 'no-linked',
      text: copy.noLinkedOfType.replace('{type}', type).replace('{object}', object),
      showAll,
    }
  }
  return null
}

/** Typesense filter for one placed group, with no descendants. */
export function peerNodeFilter(node: { structureKey: string; groupKey: string }): string {
  return `groups:=${node.structureKey}:${node.groupKey}`
}

type GroupRow = { id?: unknown; key?: unknown; parent?: unknown }

function structureGroups(structureKey: string, defs?: Json): { key: string; groups: GroupRow[] } | null {
  const structures = (defs?.structures as Json[] | undefined) ?? []
  const structure = structures.find((item) => String(item.key ?? '') === structureKey || String(item.id ?? '') === structureKey)
  if (!structure) return null
  return {
    key: String(structure.key ?? structureKey),
    groups: ((structure.groups as Json[] | undefined) ?? []) as GroupRow[],
  }
}

/** The group plus every group under it, as `structure:group` tokens. */
export function groupSubtreeTokens(structureKey: string, groupKey: string, defs?: Json): string[] {
  const bound = structureGroups(structureKey, defs)
  if (!bound || groupKey === 'unplaced') return [`${bound?.key ?? structureKey}:${groupKey}`]
  const { key, groups } = bound
  const children = new Map<string, GroupRow[]>()
  for (const group of groups) {
    const parent = String(group.parent ?? '')
    if (!parent) continue
    const list = children.get(parent) ?? []
    list.push(group)
    children.set(parent, list)
  }
  const seen = new Set<string>()
  const out: string[] = []
  const walk = (group: GroupRow) => {
    const id = String(group.id ?? '')
    const groupToken = String(group.key ?? '')
    const mark = id || groupToken
    if (!groupToken || !mark || seen.has(mark)) return
    seen.add(mark)
    out.push(`${key}:${groupToken}`)
    const kids = [
      ...(id ? children.get(id) ?? [] : []),
      ...(groupToken && groupToken !== id ? children.get(groupToken) ?? [] : []),
    ]
    for (const child of kids) walk(child)
  }
  const root = groups.find((group) => String(group.key ?? '') === groupKey || String(group.id ?? '') === groupKey)
  if (root) {
    walk(root)
    return out
  }
  // The structure title is the parent of every group in that tree.
  if (groupKey === key || groupKey === structureKey) {
    for (const group of groups) {
      if (!group.parent) walk(group)
    }
    for (const group of groups) walk(group)
    if (out.length > 0) return out
  }
  return [`${key}:${groupKey}`]
}

/** One Typesense `groups` clause. Several tokens match any of them. */
export function groupsClause(tokens: string[]): string {
  const unique = [...new Set(tokens.filter(Boolean))]
  if (unique.length === 0) return ''
  if (unique.length === 1) return `groups:=${unique[0]}`
  return `groups:=[${unique.map((token) => `\`${token}\``).join(',')}]`
}

/**
 * Filter for a structure-tree peer. With no node yet the table lists the whole
 * type (the Products workspace opens that way). A chosen node includes that
 * group and every group under it.
 */
export function structurePeerFilter(
  node: { structureKey: string; groupKey: string } | null,
  defs?: Json,
): string {
  if (!node?.structureKey || !node.groupKey) return ''
  return groupsClause(groupSubtreeTokens(node.structureKey, node.groupKey, defs))
}

/** Typesense filter for the linked peers of one or more selected rows. */
export function peerIdsFilter(ids: string[]): string {
  if (ids.length === 0) return 'id:=__no_peer__'
  const list = ids.map((id) => `\`${id}\``).join(',')
  return `id:=[${list}]`
}

type LinkEdge = { linkType: string; typeId: string }

/** Every link type edge from a source type, in definition order. */
function linkEdges(sourceTypeId: string, defs: Json | undefined): LinkEdge[] {
  if (!sourceTypeId) return []
  const out: LinkEdge[] = []
  for (const item of ((defs?.types as Json[] | undefined) ?? [])) {
    if (item.kind !== 'link') continue
    const link = (item.link as Json | undefined) ?? {}
    const from = Array.isArray(link.from_types) ? link.from_types.map(String) : []
    const to = Array.isArray(link.to_types) ? link.to_types.map(String) : []
    const linkType = String(item.key ?? '')
    if (from.includes(sourceTypeId)) for (const id of to) out.push({ linkType, typeId: id })
    if (to.includes(sourceTypeId)) for (const id of from) out.push({ linkType, typeId: id })
  }
  return out
}

/**
 * Object type ids a source row's type can reach through any link type.
 * Link types are not records and are never offered as a source (#153).
 */
export function linkedTypeIds(sourceTypeId: string, defs: Json | undefined): string[] {
  return [...new Set(linkEdges(sourceTypeId, defs).map((edge) => edge.typeId))]
}

/** Link type keys and the target type each one reaches from the source type. */
export function linkedTypeLinks(sourceTypeId: string, defs: Json | undefined): LinkEdge[] {
  return linkEdges(sourceTypeId, defs).filter((edge) => edge.linkType)
}

/** The first link type in definition order that connects both types. */
export function defaultPeerLinkType(
  sourceTypeId: string,
  targetTypeId: string,
  defs: Json | undefined,
): string | undefined {
  if (!sourceTypeId || !targetTypeId) return undefined
  return linkedTypeLinks(sourceTypeId, defs).find((edge) => edge.typeId === targetTypeId)?.linkType
}

/** Header fragment for a peer source: view title plus the live selection. */
export function peerSourceLabel(viewTitle: string, selectionLabel?: string | null): string {
  const title = viewTitle.trim()
  const selection = (selectionLabel ?? '').trim()
  if (!selection) return title
  if (selection === title) return title
  const prefixed = `${title} › `
  if (selection.startsWith(prefixed)) return selection
  return `${title} › ${selection}`
}

/**
 * Header label for an object table source.
 * Appends " · {Source}" for a peer source and " · {Catalog}" only when
 * catalogOverride differs from the workspace catalog.
 */
export function viewSourceLabel(
  view: { type: string; state?: Json },
  types: TypeName[],
  workspaceCatalog?: CatalogRef | null,
  catalogNamesById?: Record<string, string>,
  peerLabel?: string,
): string {
  if (view.type !== 'object_table') return ''
  const bound = typeOfView(view, types)
  if (!bound) return ''
  const base = copy.allOfType.replace('{type}', bound.plural)
  const peer = peerLabel ? ` · ${peerLabel}` : ''
  const override = viewCatalogOverrideRef(view.state)
  if (!catalogOverrideDiffers(override, workspaceCatalog ?? null) || !override) return `${base}${peer}`
  const name = catalogNamesById?.[override.catalogId]
  return name ? `${base}${peer} · ${name}` : `${base}${peer}`
}

export function isObjectTableView(view: { type: string }) {
  return view.type === 'object_table'
}
