import { copy } from './i18n'
import { newVersionGateOpen } from './new-version-gate'
import { chordForCommand } from './shortcuts'

/** Surfaces that can open a context menu. */
export type MenuContext =
  | 'table-header'
  | 'row'
  | 'cell'
  | 'object-detail'
  | 'group'
  | 'model'
  | 'model-type'
  | 'model-link'
  | 'model-list'
  | 'model-option'
  | 'model-family'
  | 'model-unit'
  | 'assortment'
  | 'attribute'
  | 'dock-view'
  | 'graph-node'
  | 'tab'
  | 'link'
  | 'import'

export type CommandTarget = {
  objectId?: string
  column?: string
  columnHeader?: string
  typeKey?: string
  typeLabel?: string
  structureKey?: string
  groupKey?: string
  proposalId?: string
  viewId?: string
  linkId?: string
  peerId?: string
  attributeKey?: string
  listKey?: string
  optionCode?: string
  familyKey?: string
  unitCode?: string
  workspaceId?: string
  feedbackEnabled?: boolean
  hiddenColumns?: Array<{ id: string; header: string }>
  singular?: string
  standard?: boolean
  locked?: boolean
  [key: string]: unknown
}

export type CommandGroup = 'recent' | 'best' | 'object' | 'views' | 'search' | 'ask'

export type RegistryCommand = {
  id: string
  title: string | ((target: CommandTarget) => string)
  contexts: MenuContext[]
  group?: CommandGroup
  keywords?: string[]
  kbd?: string
  danger?: boolean
  palette?: boolean
  /** Global command: Ctrl+K only, never in a right-click menu. */
  global?: boolean
  when?: (target: CommandTarget) => boolean
  /** Nested items shown in a flyout (e.g. Link to ▸). */
  children?: RegistryCommand[]
}

type Runner = (target: CommandTarget) => void | Promise<void>

const runners = new Map<string, Runner>()

export function registerCommandRunner(id: string, run: Runner): () => void {
  runners.set(id, run)
  return () => {
    if (runners.get(id) === run) runners.delete(id)
  }
}

export function runCommand(id: string, target: CommandTarget = {}): void | Promise<void> {
  const run = runners.get(id)
  if (!run) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('braian:command', { detail: { id, target } }))
    }
    return
  }
  return run(target)
}

export function commandTitle(command: RegistryCommand, target: CommandTarget = {}): string {
  return typeof command.title === 'function' ? command.title(target) : command.title
}

export const registryCommands: RegistryCommand[] = [
  {
    id: 'palette:search',
    global: true,
    title: `${copy.search}…`,
    contexts: ['object-detail', 'import', 'dock-view', 'tab'],
    group: 'views',
    keywords: ['search', 'command', 'palette'],
    kbd: chordForCommand('palette:search'),
  },
  {
    id: 'feedback:send',
    global: true,
    title: copy.sendFeedback,
    contexts: ['object-detail', 'import', 'dock-view', 'tab'],
    group: 'views',
    keywords: ['feedback', 'bug'],
    kbd: chordForCommand('feedback:send'),
    when: (target) => Boolean(target.feedbackEnabled),
  },
  {
    id: 'theme:toggle',
    global: true,
    title: copy.lightMode,
    contexts: ['object-detail', 'import', 'dock-view', 'tab'],
    group: 'views',
    keywords: ['theme', 'toggle', 'light', 'dark', 'mode'],
    palette: true,
  },
  {
    id: 'agent:open',
    global: true,
    title: copy.openAgent,
    contexts: ['object-detail', 'import', 'dock-view', 'tab'],
    group: 'views',
    keywords: ['agent', 'ai', 'ask'],
    kbd: chordForCommand('agent:open'),
    palette: true,
  },
  {
    id: 'session:sign-out',
    global: true,
    title: copy.signOut,
    contexts: ['object-detail', 'import', 'dock-view', 'tab'],
    group: 'views',
    keywords: ['logout', 'log out', 'sign out', 'session'],
    palette: true,
  },
  {
    id: 'session:reload-new-version',
    global: true,
    title: copy.reloadToNewVersion,
    contexts: ['object-detail', 'import', 'dock-view', 'tab'],
    group: 'views',
    keywords: ['reload', 'refresh', 'new version', 'update', 'deploy'],
    palette: true,
    when: () => newVersionGateOpen(),
  },
  {
    id: 'object:new',
    global: true,
    title: (target) => (target.singular ? `New ${target.singular}` : copy.newObject),
    contexts: ['row', 'cell', 'table-header', 'object-detail'],
    group: 'object',
    keywords: ['create', 'new', 'object'],
    when: (target) => Boolean(target.typeKey || target.singular),
  },
  {
    id: 'object:open',
    title: (target) => (target.singular ? `Open ${target.singular}` : copy.open),
    contexts: ['row', 'cell', 'link', 'graph-node'],
    group: 'object',
    keywords: ['open'],
    kbd: 'Enter',
    when: (target) => Boolean(target.objectId || target.groupKey || target.peerId),
  },
  {
    id: 'object:right',
    title: copy.placeRight,
    contexts: ['row', 'cell'],
    group: 'object',
    when: (target) => Boolean(target.objectId),
  },
  {
    id: 'object:history',
    title: copy.history,
    contexts: ['row', 'cell', 'object-detail'],
    group: 'object',
    when: (target) => Boolean(target.objectId),
  },
  {
    id: 'object:move-group',
    title: copy.moveToGroup,
    contexts: ['row', 'cell'],
    group: 'object',
    keywords: ['move', 'group'],
    when: (target) => Boolean(target.objectId),
  },
  {
    id: 'object:delete',
    title: copy.deleteMenu,
    contexts: ['row', 'cell', 'object-detail'],
    group: 'object',
    keywords: ['delete', 'remove', 'trash'],
    danger: true,
    when: (target) =>
      Boolean(target.objectId)
      || (Array.isArray(target.objects) && target.objects.length > 0),
  },
  {
    id: 'columns:hide',
    title: copy.hideColumn,
    contexts: ['table-header', 'cell', 'row'],
    group: 'views',
    keywords: ['column', 'hide'],
    when: (target) => Boolean(target.column),
  },
  {
    id: 'column:move-left',
    title: (target) =>
      target.columnHeader ? `${copy.moveColumnLeft} · ${target.columnHeader}` : copy.moveColumnLeft,
    contexts: ['table-header', 'cell', 'row'],
    group: 'views',
    keywords: ['column', 'move', 'left', 'reorder'],
    kbd: chordForCommand('column:move-left'),
    when: (target) => Boolean(target.column),
  },
  {
    id: 'column:move-right',
    title: (target) =>
      target.columnHeader ? `${copy.moveColumnRight} · ${target.columnHeader}` : copy.moveColumnRight,
    contexts: ['table-header', 'cell', 'row'],
    group: 'views',
    keywords: ['column', 'move', 'right', 'reorder'],
    kbd: chordForCommand('column:move-right'),
    when: (target) => Boolean(target.column),
  },
  {
    id: 'fields:select',
    global: true,
    title: `${copy.selectFields}…`,
    contexts: ['table-header', 'cell', 'row'],
    group: 'views',
    keywords: ['field', 'column', 'select', 'show', 'hide', 'reorder'],
  },
  {
    id: 'fields:edit',
    title: 'Edit field…',
    contexts: ['table-header', 'cell'],
    group: 'views',
    keywords: ['field', 'column', 'edit', 'qualifier'],
    when: (target) => Boolean(target.column),
  },
  {
    id: 'selection:new',
    global: true,
    title: copy.newSelection,
    contexts: ['assortment', 'dock-view'],
    group: 'views',
    keywords: ['assortment', 'selection'],
    when: (target) => !target.viewType || target.viewType === 'assortment_list',
  },
  {
    id: 'selection:edit',
    title: copy.editSelection,
    contexts: ['assortment'],
    group: 'views',
    keywords: ['assortment', 'selection', 'edit', 'rename', 'filter'],
    when: (target) => Boolean(target.selectionId),
  },
  {
    id: 'selection:delete',
    title: copy.deleteSelection,
    contexts: ['assortment'],
    group: 'views',
    keywords: ['assortment', 'selection', 'delete', 'remove'],
    danger: true,
    when: (target) => Boolean(target.selectionId),
  },
  {
    id: 'model:new-type',
    global: true,
    title: copy.newType,
    contexts: ['model', 'model-type'],
    group: 'object',
    keywords: ['create', 'type'],
  },
  {
    id: 'model:new-link-type',
    global: true,
    title: copy.newLinkType,
    contexts: ['model', 'model-link'],
    group: 'object',
    keywords: ['create', 'link', 'type'],
  },
  {
    id: 'model:delete-type',
    title: copy.deleteMenu,
    contexts: ['model-type'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.typeKey),
  },
  {
    id: 'model:delete-link-type',
    title: copy.deleteMenu,
    contexts: ['model-link'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.typeKey),
  },
  {
    id: 'model:new-list',
    global: true,
    title: copy.newValueList,
    contexts: ['model', 'model-list'],
    group: 'object',
  },
  {
    id: 'model:delete-list',
    title: copy.deleteValueList,
    contexts: ['model-list'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.listKey),
  },
  {
    id: 'model:delete-option',
    title: copy.deleteOption,
    contexts: ['model-option'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.listKey && target.optionCode),
  },
  {
    id: 'model:new-family',
    global: true,
    title: copy.newUnitFamily,
    contexts: ['model', 'model-family'],
    group: 'object',
  },
  {
    id: 'model:delete-family',
    title: copy.deleteUnitFamily,
    contexts: ['model-family'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.familyKey),
  },
  {
    id: 'model:delete-unit',
    title: copy.deleteUnit,
    contexts: ['model-unit'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.familyKey && target.unitCode),
  },
  {
    id: 'group:open',
    title: copy.open,
    contexts: ['group'],
    group: 'object',
    keywords: ['open'],
    kbd: 'Enter',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'group:rename',
    title: copy.rename,
    contexts: ['group'],
    group: 'object',
    kbd: 'F2',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'group:rename-key',
    title: copy.renameKey,
    contexts: ['group'],
    group: 'object',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'group:add-child',
    title: copy.addChild,
    contexts: ['group'],
    group: 'object',
    kbd: 'Ins',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'group:add-sibling',
    title: copy.addSibling,
    contexts: ['group'],
    group: 'object',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'group:duplicate',
    title: copy.duplicate,
    contexts: ['group'],
    group: 'object',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'group:delete',
    title: copy.deleteMenu,
    contexts: ['group'],
    group: 'object',
    danger: true,
    kbd: 'Del',
    when: (target) => Boolean(target.groupKey),
  },
  {
    id: 'attr:add-type',
    title: copy.addToType,
    contexts: ['attribute'],
    group: 'object',
    when: (target) => Boolean(target.attributeKey),
  },
  {
    id: 'attr:add-group',
    title: copy.addToGroup,
    contexts: ['attribute'],
    group: 'object',
    when: (target) => Boolean(target.attributeKey),
  },
  {
    id: 'attr:rename',
    title: copy.renameAttribute,
    contexts: ['attribute'],
    group: 'object',
    when: (target) => Boolean(target.attributeKey),
  },
  {
    id: 'attr:rename-key',
    title: copy.renameKey,
    contexts: ['attribute'],
    group: 'object',
    when: (target) => Boolean(target.attributeKey) && !target.standard,
  },
  {
    id: 'attr:delete',
    title: copy.deleteMenu,
    contexts: ['attribute'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.attributeKey) && !target.standard,
  },
  {
    id: 'attr:new',
    global: true,
    title: copy.newAttribute,
    contexts: ['attribute'],
    group: 'object',
  },
  {
    id: 'link:edit',
    title: copy.editLink,
    contexts: ['link'],
    group: 'object',
    when: (target) => Boolean(target.linkId),
  },
  {
    id: 'link:remove',
    title: copy.removeLink,
    contexts: ['link'],
    group: 'object',
    danger: true,
    when: (target) => Boolean(target.linkId),
  },
  {
    id: 'layout:split-left',
    title: copy.splitLeft,
    contexts: ['dock-view'],
    group: 'views',
    palette: false,
  },
  {
    id: 'layout:split-right',
    title: copy.splitRight,
    contexts: ['dock-view'],
    group: 'views',
    palette: false,
  },
  {
    id: 'layout:split-top',
    title: copy.splitTop,
    contexts: ['dock-view'],
    group: 'views',
    palette: false,
  },
  {
    id: 'layout:split-bottom',
    title: copy.splitBottom,
    contexts: ['dock-view'],
    group: 'views',
    palette: false,
  },
  {
    id: 'layout:focus:left',
    title: 'Focus pane left',
    contexts: ['dock-view'],
    group: 'views',
    keywords: ['focus', 'pane', 'left', 'neighbour'],
    kbd: chordForCommand('layout:focus:left'),
  },
  {
    id: 'layout:focus:right',
    title: 'Focus pane right',
    contexts: ['dock-view'],
    group: 'views',
    keywords: ['focus', 'pane', 'right', 'neighbour'],
    kbd: chordForCommand('layout:focus:right'),
  },
  {
    id: 'layout:focus:up',
    title: 'Focus pane up',
    contexts: ['dock-view'],
    group: 'views',
    keywords: ['focus', 'pane', 'up', 'above', 'neighbour'],
    kbd: chordForCommand('layout:focus:up'),
  },
  {
    id: 'layout:focus:down',
    title: 'Focus pane down',
    contexts: ['dock-view'],
    group: 'views',
    keywords: ['focus', 'pane', 'down', 'below', 'neighbour'],
    kbd: chordForCommand('layout:focus:down'),
  },
  {
    id: 'layout:move_view_left',
    title: copy.moveLeft,
    contexts: ['dock-view'],
    group: 'views',
    kbd: chordForCommand('layout:move_view_left'),
    palette: true,
  },
  {
    id: 'layout:move_view_right',
    title: copy.moveRight,
    contexts: ['dock-view'],
    group: 'views',
    kbd: chordForCommand('layout:move_view_right'),
    palette: true,
  },
  {
    id: 'layout:move_view_up',
    title: copy.moveUp,
    contexts: ['dock-view'],
    group: 'views',
    kbd: chordForCommand('layout:move_view_up'),
    palette: true,
  },
  {
    id: 'layout:move_view_down',
    title: copy.moveDown,
    contexts: ['dock-view'],
    group: 'views',
    kbd: chordForCommand('layout:move_view_down'),
    palette: true,
  },
  {
    id: 'layout:zoom',
    title: copy.maximize,
    contexts: ['dock-view'],
    group: 'views',
    kbd: chordForCommand('layout:zoom'),
    palette: true,
  },
  {
    id: 'layout:close_view',
    title: copy.closeView,
    contexts: ['dock-view'],
    group: 'views',
    kbd: chordForCommand('layout:close_view'),
    palette: true,
  },
  {
    id: 'layout:add-view',
    title: copy.addView,
    contexts: ['dock-view'],
    group: 'views',
    // No chord: Ctrl+K is palette:search. Open Add view from the palette / dock menu.
  },
  {
    id: 'view:select-source',
    title: copy.selectSource,
    contexts: ['dock-view'],
    group: 'views',
    keywords: ['data', 'source', 'type', 'select', 'linked', 'peer'],
    when: (target) => !target.viewType || target.viewType === 'object_table',
  },
  {
    id: 'catalog:switch',
    global: true,
    title: copy.switchCatalog,
    contexts: ['tab', 'dock-view'],
    group: 'views',
    keywords: ['catalog', 'source', 'master', 'switch', 'byt'],
  },
  {
    id: 'workspace:new',
    title: copy.newWorkspace,
    contexts: ['tab'],
    group: 'views',
  },
  {
    id: 'workspace:copy-share',
    title: copy.copyShare,
    contexts: ['tab'],
    group: 'views',
    when: (target) => Boolean(target.workspaceId),
  },
  {
    id: 'workspace:toggle-lock',
    title: (target) => (target.locked ? copy.unlockWorkspace : copy.lockWorkspace),
    contexts: ['tab'],
    group: 'views',
    when: (target) => Boolean(target.workspaceId),
  },
  {
    id: 'layout:reset_layout',
    global: true,
    title: copy.resetLayout,
    contexts: ['tab'],
    group: 'views',
  },
  {
    id: 'table:mass-edit',
    global: true,
    title: copy.massEdit,
    contexts: ['row', 'cell', 'table-header'],
    group: 'views',
    keywords: ['status', 'ok', 'mass'],
  },
  {
    id: 'table:filter-by',
    global: true,
    title: copy.filterBy,
    contexts: ['row', 'cell', 'table-header'],
    group: 'views',
    keywords: ['filter'],
  },
  {
    id: 'table:export',
    global: true,
    title: copy.export,
    contexts: ['row', 'cell', 'table-header'],
    group: 'views',
  },
  {
    id: 'table:export-columns',
    global: true,
    title: copy.exportColumns,
    contexts: ['row', 'cell', 'table-header'],
    group: 'views',
  },
  {
    id: 'table:select',
    title: copy.selectAll,
    contexts: ['row', 'cell'],
    group: 'object',
    when: (target) => Boolean(target.objectId),
    palette: false,
  },
]

export function commandsForContext(context: MenuContext, target: CommandTarget = {}): RegistryCommand[] {
  return registryCommands.filter((command) => {
    if (command.global) return false
    if (!command.contexts.includes(context)) return false
    if (command.when && !command.when(target)) return false
    return true
  })
}

export function paletteCommandsFromRegistry(target: CommandTarget = {}): RegistryCommand[] {
  return registryCommands.filter((command) => {
    if (command.palette === false) return false
    if (command.when && !command.when(target)) return false
    return true
  })
}
