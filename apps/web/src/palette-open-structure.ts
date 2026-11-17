import type { Json } from './api'
import { structureCaption } from './graph-scene'
import type { PaletteItem } from './palette-model'

export const OPEN_STRUCTURE_ROOT_ID = 'layout:open-structure'

export const OPEN_STRUCTURE_SUBMENU_LABEL = 'Open structure ›'

/** Palette root row that opens the structure-tree submenu. */
export function openStructureRootItem(): PaletteItem {
  return {
    id: OPEN_STRUCTURE_ROOT_ID,
    group: 'views',
    title: OPEN_STRUCTURE_SUBMENU_LABEL,
    subtitle: 'Open a structure tree in the workspace',
    keywords: ['open', 'structure', 'tree', 'struktur', 'träd', 'öppna'],
  }
}

export function isOpenStructureRoot(id: string) {
  return id === OPEN_STRUCTURE_ROOT_ID
}

/** Rows listed under "Open structure ›" for structures in the active catalog. */
export function openStructureSubmenuRows(defs: Json | undefined): PaletteItem[] {
  const structures = (defs?.structures as Json[] | undefined) ?? []
  return structures
    .map((structure) => {
      const key = String(structure.key ?? '').trim()
      if (!key) return null
      const label = structureCaption(key, defs, key)
      const row: PaletteItem = {
        id: `open-structure:${key}`,
        group: 'views',
        title: label,
        subtitle: key,
        keywords: [key, label, 'structure', 'tree', 'struktur'],
      }
      return row
    })
    .filter((row): row is PaletteItem => row != null)
}

export function parseOpenStructureChoice(id: string): string | null {
  if (!id.startsWith('open-structure:')) return null
  const key = id.slice('open-structure:'.length)
  return key.length > 0 ? key : null
}

export const OPEN_STRUCTURE_EMPTY_MESSAGE = 'No structures in this catalog'

export function isOpenStructureSubmenuFrame(label: string) {
  return label === OPEN_STRUCTURE_SUBMENU_LABEL
}