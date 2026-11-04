import { textValue, type Json } from './api'
import {
  commandsForContext,
  type CommandTarget,
  type MenuContext,
  type RegistryCommand,
} from './command-registry'
import { copy } from './i18n'
import { singularOf } from './type-labels'

type RowContextMenuOptions = {
  context: MenuContext
  target: CommandTarget
  defs: Json | undefined
  rowType?: string | null
  language?: string
}

function typeKeys(defs: Json | undefined, ids: unknown): string[] {
  const types = (defs?.types as Json[]) ?? []
  return (Array.isArray(ids) ? ids : []).map((id) => {
    const value = String(id)
    const match = types.find((item) => String(item.id ?? '') === value || String(item.key ?? '') === value)
    return String(match?.key ?? value)
  })
}

function endLabel(label: unknown, fallback: string, language: string): string {
  const value = label as Json | undefined
  const labels = value?.labels as Json | undefined
  return textValue(labels, language) || textValue(labels, 'en') || String(value?.key ?? '') || fallback
}

function linkCommands(
  defs: Json | undefined,
  rowType: string,
  context: MenuContext,
  language: string,
): RegistryCommand[] {
  const seen = new Set<string>()
  const items: RegistryCommand[] = []
  const links = ((defs?.types as Json[]) ?? []).filter((item) => item.kind === 'link')
  for (const item of links) {
    const spec = item.link as Json | undefined
    const key = String(item.key ?? '')
    if (!spec || !key) continue
    const fromTypes = typeKeys(defs, spec.from_types)
    const toTypes = typeKeys(defs, spec.to_types)
    const directions: Array<{ direction: 'out' | 'in'; label: unknown }> = []
    if (fromTypes.includes(rowType)) directions.push({ direction: 'out', label: spec.to_label })
    if (toTypes.includes(rowType)) directions.push({ direction: 'in', label: spec.from_label })
    for (const { direction, label } of directions) {
      const dedupeKey = `${key}:${direction}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      items.push({
        id: `link:add:${key}:${direction}`,
        title: `${copy.linkTo} ${endLabel(label, key, language)}`,
        contexts: [context],
        group: 'object',
        palette: false,
      })
    }
  }
  return items
}

/** Row menu items for the clicked row, including its own link types in both directions. */
export function buildRowContextMenu({
  context,
  target,
  defs,
  rowType,
  language = 'en',
}: RowContextMenuOptions): { target: CommandTarget; items: RegistryCommand[] } {
  const rowKey = rowType ? typeKeys(defs, [rowType])[0] ?? rowType : ''
  const singular = rowKey ? singularOf(defs, rowKey, language) : ''
  const menuTarget: CommandTarget = {
    ...target,
    singular: singular || target.singular,
  }
  const seen = new Set<string>()
  const items: RegistryCommand[] = []
  const push = (command: RegistryCommand) => {
    if (seen.has(command.id)) return
    seen.add(command.id)
    items.push(command)
  }
  for (const command of commandsForContext(context, menuTarget)) push(command)
  if (rowKey) {
    for (const command of linkCommands(defs, rowKey, context, language)) push(command)
  }
  return { target: menuTarget, items }
}
