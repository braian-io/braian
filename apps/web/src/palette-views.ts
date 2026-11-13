import { withoutDuplicateDestinations, type PaletteItem } from './palette-model'
import { displayViewTitle, typeViewPaletteItems, type SavedView, type TypeName } from './type-labels'

/** Saved views and "Articles view" rows for the Open view sub-list. */
export function viewPaletteRows(views: SavedView[], types: TypeName[], openTypeKey = ''): PaletteItem[] {
  return withoutDuplicateDestinations([
    ...typeViewPaletteItems(types).map((row) => ({ ...row, entity: false })),
    ...views
      .filter((view) => view.type !== 'agent')
      .map((view) => ({
        id: `view:${view.id}`,
        group: 'views' as const,
        title: displayViewTitle(view, types, openTypeKey),
        subtitle: 'Open view',
        entity: true,
        keywords: [view.type, view.title],
      })),
  ])
}
