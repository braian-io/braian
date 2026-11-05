import { commandTitle, registryCommands, type CommandTarget } from './command-registry'
import { copy } from './i18n'
import type { PaletteItem } from './palette-model'

const subtitles: Record<string, string> = {
  'theme:toggle': 'Toggle theme',
  'agent:open': 'Ask the agent',
  'session:sign-out': 'End this session',
  'session:reload-new-version': copy.newVersionAvailable,
  'layout:focus:left': 'Focus the neighbour on the left',
  'layout:focus:right': 'Focus the neighbour on the right',
  'layout:focus:up': 'Focus the neighbour above',
  'layout:focus:down': 'Focus the neighbour below',
}

const titleOverrides: Record<string, (target: CommandTarget) => string> = {
  'theme:toggle': (target) => (target.theme === 'dark' ? copy.lightMode : copy.darkMode),
}

export type RegistryPaletteOptions = {
  theme?: 'dark' | 'light'
  target?: CommandTarget
}

/** Palette rows derived from registry commands marked `palette: true`. */
export function registryPaletteRows({ theme = 'dark', target = {} }: RegistryPaletteOptions = {}): PaletteItem[] {
  const paletteTarget = { ...target, theme }
  return registryCommands
    .filter((command) => command.palette === true)
    .filter((command) => !command.when || command.when(paletteTarget))
    .map((command) => {
      const row: PaletteItem = {
        id: command.id,
        group: command.group ?? 'views',
        title: titleOverrides[command.id]?.(paletteTarget) ?? commandTitle(command, paletteTarget),
        subtitle: subtitles[command.id] ?? '',
        keywords: command.keywords,
      }
      if (command.kbd) {
        row.kbd = command.kbd
        row.shortcut = command.kbd
      }
      return row
    })
}



const LAYOUT_FOCUS_IDS = [
  'layout:focus:left',
  'layout:focus:right',
  'layout:focus:up',
  'layout:focus:down',
] as const

/** Ctrl+K rows for pane focus, derived from the shared command registry. */
export function registryLayoutFocusPaletteRows(): PaletteItem[] {
  return LAYOUT_FOCUS_IDS.map((id) => {
    const command = registryCommands.find((item) => item.id === id)
    if (!command) throw new Error(`missing registry command ${id}`)
    const row: PaletteItem = {
      id: command.id,
      group: command.group ?? 'views',
      title: commandTitle(command),
      subtitle: subtitles[command.id] ?? '',
      keywords: command.keywords,
    }
    if (command.kbd) {
      row.kbd = command.kbd
      row.shortcut = command.kbd
    }
    return row
  })
}

export const registryLayoutFocusCommandIds = new Set<string>(LAYOUT_FOCUS_IDS)

const COLUMN_MOVE_IDS = new Set(['column:move-left', 'column:move-right'])

/** Ctrl+K rows for move-left/right, derived from the shared command registry. */
export function registryColumnMovePaletteRows(target: CommandTarget = {}): PaletteItem[] {
  return registryCommands
    .filter((command) => COLUMN_MOVE_IDS.has(command.id))
    .filter((command) => !command.when || command.when(target))
    .map((command) => {
      const header = typeof target.columnHeader === 'string' ? target.columnHeader : ''
      const row: PaletteItem = {
        id: command.id,
        group: command.group ?? 'views',
        title: commandTitle(command, target),
        subtitle: header,
        keywords: [...(command.keywords ?? []), ...(header ? [header] : [])],
      }
      if (command.kbd) {
        row.kbd = command.kbd
        row.shortcut = command.kbd
      }
      return row
    })
}

export const registryColumnMoveCommandIds = COLUMN_MOVE_IDS

export const registryPaletteCommandIds = new Set(
  registryCommands.filter((command) => command.palette === true).map((command) => command.id),
)
