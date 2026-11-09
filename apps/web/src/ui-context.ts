export type SelectedObject = { id: string; key: string; name: string; type: string; version?: string }

export type UiPane = { id: string; type: string; title: string; focused: boolean }

/** A table column in display order. `id` is the key `ui.hide_column` and `ui.show_column` take. */
export type UiColumn = { id: string; header: string; hidden: boolean }

export type UiContextSnapshot = {
  workspace: { id: string; name: string; type?: string } | null
  panes: UiPane[]
  focused: string | null
  selection: SelectedObject[]
  filter: string
  /** Typesense filter expression the focused table sends with its search. */
  filterExpression: string
  sort: string
  columns: UiColumn[]
  /** Header the user last clicked in the focused table (for Move column left/right). */
  activeColumn: string | null
  language: string
}

type Frame = {
  workspace: UiContextSnapshot['workspace']
  panes: UiPane[]
  focused: string | null
  language: string
}

const blankFrame = (): Frame => ({ workspace: null, panes: [], focused: null, language: 'en' })

let frame: Frame = blankFrame()
let markedId: string | null = null
const tables = new Map<string, { filter: string; sort: string; filterExpression: string }>()
const tableColumns = new Map<string, UiColumn[]>()
const activeColumns = new Map<string, string>()
let lastActiveColumnViewId: string | null = null
const selections = new Map<string, SelectedObject[]>()
const enriched = new Map<string, SelectedObject>()

/** Selected tree node in one view, used as a live peer source (Notion 103 PR 2). */
export type TreeNodeSelection = { structureId: string; structureKey: string; groupKey: string }
const treeNodes = new Map<string, TreeNodeSelection>()
export const EMPTY_SELECTION: SelectedObject[] = []
const selectionListeners = new Set<() => void>()
let selectionVersion = 0

function bumpSelection() {
  selectionVersion += 1
  for (const listener of selectionListeners) listener()
}

/** Subscribe to row/tree selection changes across views. */
export function subscribeUiSelections(listener: () => void) {
  selectionListeners.add(listener)
  return () => {
    selectionListeners.delete(listener)
  }
}

/** Snapshot for useSyncExternalStore; bumps on every published selection. */
export function uiSelectionVersion() {
  return selectionVersion
}

export function readSelection(viewId: string): SelectedObject[] {
  return selections.get(viewId) ?? EMPTY_SELECTION
}

export function readTreeNode(viewId: string): TreeNodeSelection | null {
  return treeNodes.get(viewId) ?? null
}

export function resetUiContext() {
  frame = blankFrame()
  markedId = null
  tables.clear()
  tableColumns.clear()
  activeColumns.clear()
  lastActiveColumnViewId = null
  selections.clear()
  enriched.clear()
  treeNodes.clear()
  bumpSelection()
}

export function panesFromCatalog(
  openIds: string[],
  focused: string | null,
  catalog: Array<{ id: string; type: string; title: string }>,
): UiPane[] {
  const byId = new Map(catalog.map((view) => [view.id, view]))
  return openIds.map((id) => {
    const view = byId.get(id)
    return { id, type: view?.type ?? '', title: view?.title ?? id, focused: id === focused }
  })
}

export function publishFrame(next: Frame) {
  frame = next
}

export function publishMarked(id: string | null) {
  markedId = id
}

export function publishTable(viewId: string, filter: string, sort: string, filterExpression = '') {
  tables.set(viewId, { filter, sort, filterExpression })
}

export function publishColumns(viewId: string, columns: UiColumn[]) {
  tableColumns.set(viewId, columns)
}

export function publishActiveColumn(viewId: string, columnId: string | null) {
  if (columnId) {
    activeColumns.set(viewId, columnId)
    lastActiveColumnViewId = viewId
    return
  }
  activeColumns.delete(viewId)
  if (lastActiveColumnViewId !== viewId) return
  lastActiveColumnViewId = [...activeColumns.keys()].at(-1) ?? null
}

/** The header last activated in this exact view, never another pane's header. */
export function readActiveColumn(viewId: string | null | undefined): string | null {
  if (!viewId) return null
  return activeColumns.get(viewId) ?? null
}

/** The most recently activated header and the view that owns it. */
export function readLastActiveColumn(): { viewId: string; column: string } | null {
  if (!lastActiveColumnViewId) return null
  const column = activeColumns.get(lastActiveColumnViewId)
  return column ? { viewId: lastActiveColumnViewId, column } : null
}

/** Columns published by one exact table, for a command that names that table. */
export function readColumns(viewId: string | null | undefined): UiColumn[] {
  if (!viewId) return []
  return (tableColumns.get(viewId) ?? []).map((column) => ({ ...column }))
}

export function publishSelection(viewId: string, rows: SelectedObject[]) {
  const previous = selections.get(viewId)
  if (previous && sameSelection(previous, rows)) return
  selections.set(viewId, rows)
  bumpSelection()
}

export function publishTreeNode(viewId: string, node: TreeNodeSelection) {
  const previous = treeNodes.get(viewId)
  if (
    previous
    && previous.structureId === node.structureId
    && previous.structureKey === node.structureKey
    && previous.groupKey === node.groupKey
  ) return
  treeNodes.set(viewId, node)
  bumpSelection()
}

function sameSelection(left: SelectedObject[], right: SelectedObject[]) {
  if (left.length !== right.length) return false
  return left.every((row, index) => {
    const other = right[index]
    if (!other) return false
    return row.id === other.id
      && row.key === other.key
      && row.name === other.name
      && row.type === other.type
      && (row.version ?? '') === (other.version ?? '')
  })
}

export function enrichSelection(object: SelectedObject) {
  const previous = enriched.get(object.id)
  const next: SelectedObject = {
    id: object.id,
    key: object.key || previous?.key || '',
    name: object.name || previous?.name || '',
    type: object.type || previous?.type || '',
  }
  const version = object.version || previous?.version || ''
  if (version) next.version = version
  enriched.set(object.id, next)
}

function mergeObject(object: SelectedObject): SelectedObject {
  const extra = enriched.get(object.id)
  if (!extra) return object
  const merged: SelectedObject = {
    id: object.id,
    key: object.key || extra.key,
    name: object.name || extra.name,
    type: object.type || extra.type,
  }
  const version = object.version || extra.version || ''
  if (version) merged.version = version
  return merged
}

export function readUiContext(): UiContextSnapshot {
  const focused = frame.focused
  const table = (focused && tables.get(focused)) || [...tables.values()][0]
  const columns = (focused && tableColumns.get(focused)) || [...tableColumns.values()][0] || []
  const activeColumn =
    (focused && activeColumns.get(focused)) || [...activeColumns.values()][0] || null
  const chosen = (focused && selections.get(focused)) || [...selections.values()].find((rows) => rows.length > 0) || []
  let selection = chosen.map(mergeObject)
  if (selection.length === 0 && markedId) {
    selection = [mergeObject({ id: markedId, key: '', name: '', type: '' })]
  } else if (markedId && !selection.some((item) => item.id === markedId)) {
    selection = [mergeObject({ id: markedId, key: '', name: '', type: '' }), ...selection]
  }
  return {
    workspace: frame.workspace,
    panes: frame.panes,
    focused,
    selection,
    filter: table?.filter ?? '',
    filterExpression: table?.filterExpression ?? '',
    sort: table?.sort ?? '',
    columns: columns.map((column) => ({ ...column })),
    activeColumn,
    language: frame.language || 'en',
  }
}
