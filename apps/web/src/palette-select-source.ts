import { copy } from './i18n'
import type { TypeName } from './type-labels'
import type { PaletteItem } from './palette-model'
import type { PeerSelection } from './view-source'

export const SELECT_SOURCE_ROOT_ID = 'view:select-source'

/** A live selection in another view that can drive a target type. */
export type PeerSourceOption = {
  viewId: string
  viewTitle: string
  selection: PeerSelection
  /** The selected row key/name or tree-node label. */
  label: string
  /** Object type ids this source can drive. */
  typeIds: string[]
}

/** Palette / menu root that opens the type-source submenu (Notion 103 PR 1). */
export function selectSourceRootItem(): PaletteItem {
  return {
    id: SELECT_SOURCE_ROOT_ID,
    group: 'views',
    title: `${copy.dataSource} ›`,
    subtitle: copy.selectSource,
    keywords: ['data', 'source', 'type', 'select', 'all', 'objects', 'linked', 'peer'],
  }
}

/**
 * Types listed under Data source › / Select source ›.
 * Each "All …" row is followed by the live peer sources valid for that type.
 */
export function selectSourceSubmenuRows(types: TypeName[], peerOptions: PeerSourceOption[] = []): PaletteItem[] {
  const rows: PaletteItem[] = []
  for (const type of types) {
    if (type.kind === 'link' || !type.id || !type.key) continue
    rows.push({
      id: `select-source:type:${type.id}`,
      group: 'views',
      title: copy.allOfType.replace('{type}', type.plural),
      subtitle: copy.selectSource,
      keywords: [type.key, type.singular, type.plural, 'all'],
    })
    for (const option of peerOptions) {
      if (!option.typeIds.includes(type.id) && !option.typeIds.includes(type.key)) continue
      rows.push({
        id: `select-source:peer:${type.id}:${option.viewId}:${option.selection}`,
        group: 'views',
        title: copy.fromSourceLabel.replace('{type}', type.plural).replace('{source}', option.viewTitle),
        subtitle: option.label,
        keywords: [type.key, type.singular, type.plural, option.viewTitle, option.label, 'linked', 'peer', 'source'],
      })
    }
  }
  return rows
}

export function isSelectSourceRoot(id: string) {
  return id === SELECT_SOURCE_ROOT_ID
}

export type SelectSourceChoice =
  | { typeId: string }
  | { peerViewId: string; selection: PeerSelection }

export function parseSelectSourceChoice(id: string): SelectSourceChoice | null {
  if (id.startsWith('select-source:type:')) {
    const typeId = id.slice('select-source:type:'.length)
    return typeId ? { typeId } : null
  }
  if (id.startsWith('select-source:peer:')) {
    const rest = id.slice('select-source:peer:'.length)
    const viewId = rest.split(':')[1] ?? ''
    const selection = rest.split(':')[2] === 'node' ? 'node' : 'row'
    return viewId ? { peerViewId: viewId, selection } : null
  }
  return null
}
