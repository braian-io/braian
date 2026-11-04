import { argumentBreadcrumb } from './palette-core'
import type { PaletteArgument, PaletteItem } from './palette-model'
import type { TypeName } from './type-labels'

export type OperationParamRecord = { name: string; type: string }

export type OperationRecord = {
  name: string
  title: string
  params?: OperationParamRecord[]
}

/** Commands the palette can drill into when `/v1/operations` has not loaded. */
export const fallbackArgumentOperations: OperationRecord[] = [
  { name: 'ui.open_view', title: 'Open view', params: [{ name: 'id', type: 'view' }] },
  { name: 'ui.open_workspace', title: 'Open workspace', params: [{ name: 'id', type: 'workspace' }] },
  { name: 'get_object', title: 'Open object', params: [{ name: 'id', type: 'object' }] },
]

const paletteOperationNames = new Set(['ui.open_view', 'ui.open_workspace', 'get_object'])

function argumentOf(params: OperationParamRecord[] | undefined, typeKeys: Set<string>): PaletteArgument | undefined {
  return params?.find((param) => param.type === 'view' || param.type === 'workspace' || param.type === 'object' || typeKeys.has(param.type))
}

/**
 * Palette commands taken from the operation registry.
 * Per-type "Open product" rows use the same `object` param, filtered by the type key.
 * Type keys live in the catalog, so they are not static registry entries.
 */
export function argumentCommands(operations: OperationRecord[] | undefined, types: TypeName[]): PaletteItem[] {
  const typeKeys = new Set(types.map((type) => type.key))
  const listed = operations?.some((operation) => (operation.params?.length ?? 0) > 0)
    ? operations
    : fallbackArgumentOperations
  const fromRegistry = (listed ?? [])
    .filter((operation) => paletteOperationNames.has(operation.name))
    .flatMap((operation) => {
      const argument = argumentOf(operation.params, typeKeys)
      if (!argument) return []
      const row: PaletteItem = {
        id: `op:${operation.name}`,
        group: 'views',
        title: argumentBreadcrumb(operation.title),
        subtitle: 'Search and open',
        keywords: [operation.name, argument.type, 'open'],
        argument,
      }
      return [row]
    })
  const fromTypes = types
    .filter((type) => type.id && type.kind !== 'link')
    .map((type) => ({
      id: `op:open:${type.key}`,
      group: 'views' as const,
      title: argumentBreadcrumb(`Open ${type.singular.toLowerCase()}`),
      subtitle: type.plural,
      keywords: [type.key, type.singular, type.plural, 'open'],
      argument: { name: 'id', type: type.key },
    }))
  return [...fromRegistry, ...fromTypes]
}
