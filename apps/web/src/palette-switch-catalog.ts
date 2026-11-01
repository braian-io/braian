import { copy } from './i18n'
import type { PaletteItem } from './palette-model'

export const SWITCH_CATALOG_ROOT_ID = 'catalog:switch'

export type CatalogOption = { id: string; key: string; name: string; kind?: string }

export function switchCatalogRootItem(currentName?: string): PaletteItem {
  return {
    id: SWITCH_CATALOG_ROOT_ID,
    group: 'views',
    title: `${copy.switchCatalog} ›`,
    subtitle: currentName || copy.masterCatalog,
    keywords: ['catalog', 'source', 'master', 'switch', 'byt'],
  }
}

export function isSwitchCatalogRoot(id: string) {
  return id === SWITCH_CATALOG_ROOT_ID
}

export function switchCatalogSubmenuRows(catalogs: CatalogOption[]): PaletteItem[] {
  const rows = catalogs.length > 0
    ? catalogs
    : [{ id: '018f1000-0000-7000-8000-000000000001', key: 'master', name: copy.masterCatalog, kind: 'master' }]
  return rows.map((row) => ({
    id: `catalog:${row.id}`,
    sourceId: `catalog:${row.id}`,
    group: 'views' as const,
    title: row.name || row.key,
    subtitle: row.key,
    keywords: ['catalog', row.key, row.name || '', row.id],
  }))
}

/** Returns catalogId from a submenu choice id. */
export function parseSwitchCatalogChoice(id: string): string | null {
  if (!id.startsWith('catalog:') || id === SWITCH_CATALOG_ROOT_ID) return null
  const catalogId = id.slice('catalog:'.length)
  return catalogId.length > 0 ? catalogId : null
}
