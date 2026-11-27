import { copy } from './i18n'
import type { TypeName } from './type-labels'

/** True when objects of this type may be classified in the given structure tree. */
export function typeAcceptsStructure(
  type: TypeName,
  structureKey: string,
  structureId: string,
): boolean {
  if (!type.id || type.kind === 'link') return false
  const allowed = type.structures
  if (allowed !== undefined && allowed.length === 0) return false
  if (allowed === undefined) return true
  return allowed.includes(structureId) || allowed.includes(structureKey)
}

/** Entity types that can be shown for a structure tree, in stable display order. */
export function entityTypesForStructure(
  structureKey: string,
  structureId: string,
  types: TypeName[],
): TypeName[] {
  return types
    .filter((type) => typeAcceptsStructure(type, structureKey, structureId))
    .sort((left, right) => left.plural.localeCompare(right.plural, 'en'))
}

/** Context-menu label for opening a type table filtered by the tree selection. */
export function showEntityTypeMenuLabel(type: TypeName): string {
  return copy.showEntityType.replace('{type}', type.plural)
}