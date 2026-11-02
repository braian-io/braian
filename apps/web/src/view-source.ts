import type { Json } from './api'
import { catalogOverrideDiffers, viewCatalogOverrideRef, type CatalogRef } from './catalog-ref'
import { copy } from './i18n'
import { typeOfView, type TypeName } from './type-labels'

export type PeerSelection = 'row' | 'node'
export type PeerSourceRef = { kind: 'peer'; viewId: string; selection: PeerSelection }

/** Persist "all objects of a type" on an object_table view (Notion 103 PR 1). */
export function applyTypeSource(state: Json | undefined, type: TypeName): Json {
  return {
    ...(state ?? {}),
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

/**
 * Persist a live source: another view's selected row or tree node.
 * The selection itself is read from the UI registry, never copied into state.
 */
export function applyPeerSource(state: Json | undefined, viewId: string, selection: PeerSelection): Json {
  return {
    ...(state ?? {}),
    source: { kind: 'peer', viewId, selection },
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
  return {
    kind: 'peer',
    viewId,
    selection: record.selection === 'node' ? 'node' : 'row',
  }
}

/** Typesense filter for a tree node in another view. */
export function peerNodeFilter(node: { structureKey: string; groupKey: string }): string {
  return `groups:=${node.structureKey}:${node.groupKey}`
}

/** Typesense filter for the linked peers of one or more selected rows. */
export function peerIdsFilter(ids: string[]): string {
  if (ids.length === 0) return 'id:=__no_peer__'
  const list = ids.map((id) => `\`${id}\``).join(',')
  return `id:=[${list}]`
}

/**
 * Object type ids a source row's type can reach through any link type.
 * Link types are not records and are never offered as a source (#153).
 */
export function linkedTypeIds(sourceTypeId: string, defs: Json | undefined): string[] {
  if (!sourceTypeId) return []
  const out = new Set<string>()
  for (const item of ((defs?.types as Json[] | undefined) ?? [])) {
    if (item.kind !== 'link') continue
    const link = (item.link as Json | undefined) ?? {}
    const from = Array.isArray(link.from_types) ? link.from_types.map(String) : []
    const to = Array.isArray(link.to_types) ? link.to_types.map(String) : []
    if (from.includes(sourceTypeId)) for (const id of to) out.add(id)
    if (to.includes(sourceTypeId)) for (const id of from) out.add(id)
  }
  return [...out]
}

/** Header fragment for a peer source: view title plus the live selection. */
export function peerSourceLabel(viewTitle: string, selectionLabel?: string | null): string {
  return selectionLabel ? `${viewTitle} › ${selectionLabel}` : viewTitle
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
  const name = catalogNamesById?.[override.catalogId] || override.catalogId
  return `${base}${peer} · ${name}`
}

export function isObjectTableView(view: { type: string }) {
  return view.type === 'object_table'
}
