import { copy } from './i18n'
import type { TypeName } from './type-labels'
import type { PaletteItem } from './palette-model'
import { wouldCreateCycle, type PeerSelection } from './view-source'

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
  /** Link type keys that connect the source type to each target type. */
  links?: Array<{ typeId: string; linkType: string }>
}

export type CurrentSource = {
  typeId: string
  peerViewId?: string
  selection?: PeerSelection
  linkType?: string
}

/** The target view and its source chain, used to reject cycles up front. */
export type SourceCycleCheck = {
  targetViewId: string
  sourceOf: (viewId: string) => string | undefined | null
}

/**
 * The view the picker will change. A dock menu passes its explicit view so the
 * picker keeps working on that panel even while another panel holds focus.
 * Ctrl+K has no explicit target and follows the focused object table.
 */
export function resolveSourceTarget<T extends { id: string; type: string }>(
  views: T[],
  explicitViewId?: string | null,
  focusViewId?: string | null,
): T | undefined {
  const explicit = explicitViewId
    ? views.find((view) => view.id === explicitViewId && view.type === 'object_table')
    : undefined
  if (explicit) return explicit
  const focused = focusViewId
    ? views.find((view) => view.id === focusViewId && view.type === 'object_table')
    : undefined
  return focused ?? views.find((view) => view.type === 'object_table')
}

function linkTypesFor(option: PeerSourceOption, type: TypeName): string[] {
  const typeIds = new Set([type.id, type.key].filter(Boolean))
  const keys = (option.links ?? [])
    .filter((link) => typeIds.has(link.typeId))
    .map((link) => link.linkType)
    .filter(Boolean)
  return [...new Set(keys)]
}

function marked(row: PaletteItem, current: boolean): PaletteItem {
  return current ? { ...row, chips: [{ text: copy.current, tone: 'ok' }] } : row
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
export function selectSourceSubmenuRows(
  types: TypeName[],
  peerOptions: PeerSourceOption[] = [],
  current?: CurrentSource | null,
  cycleCheck?: SourceCycleCheck,
): PaletteItem[] {
  const rows: PaletteItem[] = []
  for (const type of types) {
    if (type.kind === 'link' || !type.id || !type.key) continue
    const allCurrent = Boolean(current && current.typeId === type.id && !current.peerViewId)
    rows.push(marked({
      id: `select-source:type:${type.id}`,
      group: 'views',
      title: copy.allOfType.replace('{type}', type.plural),
      subtitle: copy.selectSource,
      keywords: [type.key, type.singular, type.plural, 'all'],
    }, allCurrent))
    for (const option of peerOptions) {
      if (!option.typeIds.includes(type.id) && !option.typeIds.includes(type.key)) continue
      const linkTypes = linkTypesFor(option, type)
      const many = linkTypes.length > 1
      const variants = many ? linkTypes : [linkTypes[0]]
      for (const linkType of variants) {
        const peerCurrent = Boolean(
          current
          && current.typeId === type.id
          && current.peerViewId === option.viewId
          && current.selection === option.selection
          && (many
            ? current.linkType === linkType || (!current.linkType && linkType === linkTypes[0])
            : !current.linkType || current.linkType === linkType),
        )
        const createsCycle = Boolean(
          cycleCheck
          && wouldCreateCycle(option.viewId, cycleCheck.targetViewId, cycleCheck.sourceOf),
        )
        const title = many
          ? copy.fromSourceViaLabel
            .replace('{type}', type.plural)
            .replace('{source}', option.viewTitle)
            .replace('{linkType}', linkType ?? '')
          : copy.fromSourceLabel.replace('{type}', type.plural).replace('{source}', option.viewTitle)
        const subtitle = createsCycle
          ? [option.label, copy.wouldCreateCycle].filter(Boolean).join(' · ')
          : option.label
        rows.push(marked({
          id: `select-source:peer:${type.id}:${option.viewId}:${option.selection}${many && linkType ? `:${linkType}` : ''}`,
          group: 'views',
          title,
          subtitle,
          ...(createsCycle ? { disabled: true } : {}),
          keywords: [
            type.key,
            type.singular,
            type.plural,
            option.viewTitle,
            option.label,
            linkType ?? '',
            'linked',
            'peer',
            'source',
          ],
        }, peerCurrent))
      }
    }
  }
  return rows
}

export function isSelectSourceRoot(id: string) {
  return id === SELECT_SOURCE_ROOT_ID
}

export type SelectSourceChoice =
  | { typeId: string }
  | { peerViewId: string; selection: PeerSelection; linkType?: string }

export function parseSelectSourceChoice(id: string): SelectSourceChoice | null {
  if (id.startsWith('select-source:type:')) {
    const typeId = id.slice('select-source:type:'.length)
    return typeId ? { typeId } : null
  }
  if (id.startsWith('select-source:peer:')) {
    const rest = id.slice('select-source:peer:'.length)
    const parts = rest.split(':')
    const viewId = parts[1] ?? ''
    const selection = parts[2] === 'node' ? 'node' : 'row'
    const linkType = parts[3] || undefined
    return viewId ? { peerViewId: viewId, selection, ...(linkType ? { linkType } : {}) } : null
  }
  return null
}
