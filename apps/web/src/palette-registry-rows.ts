import { commandTitle, registryCommands, type CommandTarget } from './command-registry'
import { copy } from './i18n'
import type { PaletteItem } from './palette-model'

const subtitles: Record<string, string> = {
  'theme:toggle': 'Toggle theme',
  'agent:open': 'Ask the agent',
  'session:sign-out': 'End this session',
  'session:reload-new-version': copy.newVersionAvailable,
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

export const registryPaletteCommandIds = new Set(
  registryCommands.filter((command) => command.palette === true).map((command) => command.id),
)
