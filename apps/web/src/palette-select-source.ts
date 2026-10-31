import { copy } from './i18n'
import type { TypeName } from './type-labels'
import type { PaletteItem } from './palette-model'

export const SELECT_SOURCE_ROOT_ID = 'view:select-source'

/** Palette / menu root that opens the type-source submenu (Notion 103 PR 1). */
export function selectSourceRootItem(): PaletteItem {
  return {
    id: SELECT_SOURCE_ROOT_ID,
    group: 'views',
    title: `${copy.dataSource} ›`,
    subtitle: copy.selectSource,
    keywords: ['data', 'source', 'type', 'select', 'all', 'objects'],
  }
}

/** Types listed under Data source › / Select source ›. */
export function selectSourceSubmenuRows(types: TypeName[]): PaletteItem[] {
  return types
    .filter((type) => type.kind !== 'link' && type.id && type.key)
    .map((type) => ({
      id: `select-source:type:${type.id}`,
      group: 'views' as const,
      title: copy.allOfType.replace('{type}', type.plural),
      subtitle: copy.selectSource,
      keywords: [type.key, type.singular, type.plural, 'all'],
    }))
}

export function isSelectSourceRoot(id: string) {
  return id === SELECT_SOURCE_ROOT_ID
}

export function parseSelectSourceChoice(id: string): { typeId: string } | null {
  if (!id.startsWith('select-source:type:')) return null
  const typeId = id.slice('select-source:type:'.length)
  return typeId ? { typeId } : null
}
