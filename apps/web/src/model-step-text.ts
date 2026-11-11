import { textValue, type Json } from './api'
import { copy, uiLanguage } from './i18n'

/** One step as the review surfaces show it: a sentence with display names. */
export type ModelStepText = {
  key: string
  op: string
  sentence: string
  /** The step changes the trees a type may use, so the review highlights it. */
  allowedTrees: boolean
}

function rec(value: unknown): Json | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Json
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function label(value: unknown): string {
  return textValue(value, uiLanguage).trim()
}

function typeRecord(defs: Json | undefined, key: string): Json | undefined {
  if (!key) return undefined
  return ((defs?.types as Json[] | undefined) ?? []).find(
    (item) => String(item.key ?? '') === key || String(item.id ?? '') === key,
  )
}

function typeName(defs: Json | undefined, key: string): string {
  const objectType = typeRecord(defs, key)
  return label(objectType?.singular) || label(objectType?.labels) || label(objectType?.plural) || copy.objectType
}

function attributeName(defs: Json | undefined, key: string, fallback = ''): string {
  const attribute = ((defs?.attributes as Json[] | undefined) ?? []).find(
    (item) => String(item.key ?? '') === key || String(item.id ?? '') === key,
  )
  return label(attribute?.labels) || fallback || copy.attribute
}

function structureRecord(defs: Json | undefined, token: string): Json | undefined {
  if (!token) return undefined
  return ((defs?.structures as Json[] | undefined) ?? []).find(
    (item) => String(item.id ?? '') === token || String(item.key ?? '') === token,
  )
}

function structureName(defs: Json | undefined, token: string): string {
  return label(structureRecord(defs, token)?.labels) || copy.structure
}

function groupName(defs: Json | undefined, structureToken: string, groupToken: string): string {
  const structure = structureRecord(defs, structureToken)
  const groups = (structure?.groups as Json[] | undefined) ?? []
  const group = groups.find(
    (item) => String(item.id ?? '') === groupToken || String(item.key ?? '') === groupToken,
  )
  return label(group?.labels) || copy.group
}

function valueListName(defs: Json | undefined, key: string): string {
  const valueList = ((defs?.value_lists as Json[] | undefined) ?? []).find(
    (item) => String(item.key ?? '') === key || String(item.id ?? '') === key,
  )
  return label(valueList?.labels) || copy.newValueList
}

function unitFamilyName(defs: Json | undefined, key: string): string {
  const family = ((defs?.unit_families as Json[] | undefined) ?? []).find(
    (item) => String(item.key ?? '') === key || String(item.id ?? '') === key,
  )
  return label(family?.labels) || text(family?.dimension) || copy.newUnitFamily
}

function optionName(defs: Json | undefined, listKey: string, option: string): string {
  const valueList = ((defs?.value_lists as Json[] | undefined) ?? []).find(
    (item) => String(item.key ?? '') === listKey || String(item.id ?? '') === listKey,
  )
  const found = ((valueList?.options as Json[] | undefined) ?? []).find(
    (item) => String(item.code ?? '') === option || String(item.key ?? '') === option,
  )
  return label(found?.labels) || copy.valueOption
}

function linkTypeName(defs: Json | undefined, key: string): string {
  const objectType = typeRecord(defs, key)
  return label(objectType?.singular) || label(objectType?.labels) || copy.newLinkType
}

function target(
  defs: Json | undefined,
  typeKey: string,
  structure: string,
  group: string,
): string {
  if (typeKey) return typeName(defs, typeKey)
  if (group) return groupName(defs, structure, group)
  if (structure) return structureName(defs, structure)
  return copy.dataModel
}

function allowedTreesSentence(defs: Json | undefined, typeKey: string, tokens: string[]): string {
  const names = tokens.map((token) => label(structureRecord(defs, token)?.labels)).filter(Boolean)
  return `${copy.allowedTreesFor} ${typeName(defs, typeKey)}: ${names.length > 0 ? names.join(', ') : copy.none}`
}

/**
 * A human sentence for one model step, using display names from the definitions.
 * Keys and ids stay out unless the step itself is about a key change.
 */
export function modelStepSentence(step: Json, defs: Json | undefined): string {
  const op = String(step.op ?? '')
  const typeKey = String(step.type_key ?? step.type ?? step.key ?? step.id ?? '')
  switch (op) {
    case 'set_structures':
      return allowedTreesSentence(defs, typeKey, list(step.structures))
    case 'update_type': {
      const parts: string[] = []
      const display = typeName(defs, typeKey)
      const singular = text(step.singular)
      const plural = text(step.plural)
      if (singular) parts.push(`Set the singular name of ${display} to ${singular}`)
      if (plural) parts.push(`Set the plural name of ${display} to ${plural}`)
      if (step.structures !== undefined) parts.push(allowedTreesSentence(defs, typeKey, list(step.structures)))
      if (step.defaults !== undefined) parts.push(`Update defaults for ${display}`)
      return parts.join('. ') || `Update type ${display}`
    }
    case 'create_type': {
      const display = text(step.label) || typeName(defs, String(step.key ?? ''))
      return `Create type ${display}`
    }
    case 'create_link_type': {
      const display = text(step.label) || linkTypeName(defs, String(step.key ?? ''))
      return `Create link type ${display}`
    }
    case 'update_link_type': {
      const display = text(step.label) || linkTypeName(defs, String(step.key ?? ''))
      return `Update link type ${display}`
    }
    case 'delete_link_type':
      return `Delete link type ${linkTypeName(defs, String(step.key ?? ''))}`
    case 'delete_type':
      return `Delete type ${typeName(defs, String(step.key ?? ''))}`
    case 'create_attribute': {
      const display = text(step.label) || attributeName(defs, String(step.key ?? ''))
      return `Create attribute ${display}`
    }
    case 'attach_attribute':
      return `Add ${attributeName(defs, String(step.attribute ?? ''))} to ${target(
        defs,
        String(step.type_key ?? ''),
        String(step.structure ?? ''),
        String(step.group ?? ''),
      )}`
    case 'detach_attribute':
      return `Remove ${attributeName(defs, String(step.attribute ?? ''))} from ${target(
        defs,
        String(step.type_key ?? ''),
        String(step.structure ?? ''),
        String(step.group ?? ''),
      )}`
    case 'delete_attribute':
      return `Delete attribute ${attributeName(defs, String(step.key ?? ''))}`
    case 'add_attribute':
      return `Add ${attributeName(defs, String(step.attribute ?? ''))} to ${groupName(
        defs,
        String(step.structure ?? ''),
        String(step.class_key ?? step.group ?? ''),
      )}`
    case 'remove_attribute':
      return `Remove ${attributeName(defs, String(step.attribute ?? ''))} from ${groupName(
        defs,
        String(step.structure ?? ''),
        String(step.class_key ?? step.group ?? ''),
      )}`
    case 'reorder_attributes':
      return `Reorder attributes in ${groupName(
        defs,
        String(step.structure ?? ''),
        String(step.class_key ?? step.group ?? ''),
      )}`
    case 'reorder_type_attributes':
      return `Reorder attributes on ${typeName(defs, typeKey)}`
    case 'move_class':
      return `Move ${groupName(defs, String(step.structure ?? ''), String(step.class_key ?? ''))} to ${groupName(
        defs,
        String(step.structure ?? ''),
        String(step.group ?? ''),
      )}`
    case 'set_parent':
      return `Set the parent of ${groupName(
        defs,
        String(step.structure ?? ''),
        String(step.class_key ?? step.group ?? ''),
      )}`
    case 'create_group':
    case 'create_class': {
      const display = text(step.label) || groupName(defs, String(step.structure ?? ''), String(step.group ?? step.class_key ?? ''))
      return `Add group ${display} to ${structureName(defs, String(step.structure ?? ''))}`
    }
    case 'rename_group': {
      const display = text(step.label) || groupName(defs, String(step.structure ?? ''), String(step.group ?? ''))
      return `Rename group to ${display}`
    }
    case 'move_group': {
      const display = groupName(defs, String(step.structure ?? ''), String(step.group ?? ''))
      const parent = text(step.parent)
        ? groupName(defs, String(step.structure ?? ''), String(step.parent))
        : copy.structureRoot
      return `Move ${display} under ${parent}`
    }
    case 'delete_group':
      return `Delete group ${groupName(defs, String(step.structure ?? ''), String(step.group ?? ''))}`
    case 'duplicate_group': {
      const display = groupName(defs, String(step.structure ?? ''), String(step.group ?? ''))
      return `Duplicate group ${display}`
    }
    case 'create_structure': {
      const display = text(step.label) || structureName(defs, String(step.key ?? ''))
      return `Create structure ${display}`
    }
    case 'rename_structure':
    case 'update_structure':
      return `Rename structure to ${text(step.label) || structureName(defs, String(step.structure ?? ''))}`
    case 'delete_structure':
      return `Delete structure ${structureName(defs, String(step.structure ?? ''))}`
    case 'create_value_list': {
      const display = text(step.label) || valueListName(defs, String(step.key ?? ''))
      return `Create value list ${display}`
    }
    case 'update_value_list':
      return `Update value list ${valueListName(defs, String(step.key ?? ''))}`
    case 'delete_value_list':
      return `Delete value list ${valueListName(defs, String(step.key ?? ''))}`
    case 'delete_value_option':
      return `Delete option ${optionName(
        defs,
        String(step.list ?? ''),
        String(step.option ?? ''),
      )} from ${valueListName(defs, String(step.list ?? ''))}`
    case 'create_unit_family': {
      const display = text(step.label) || unitFamilyName(defs, String(step.key ?? ''))
      return `Create unit family ${display}`
    }
    case 'update_unit_family':
      return `Update unit family ${unitFamilyName(defs, String(step.key ?? ''))}`
    case 'delete_unit_family':
      return `Delete unit family ${unitFamilyName(defs, String(step.key ?? ''))}`
    case 'delete_unit':
      return `Delete unit ${text(step.unit) || copy.unit} from ${unitFamilyName(defs, String(step.family ?? ''))}`
    case 'rename_type_key':
      return `Rename the key of ${typeName(defs, String(step.key ?? ''))} to ${text(step.new_key)}`
    case 'rename_attribute_key':
      return `Rename the key of ${attributeName(defs, String(step.key ?? ''))} to ${text(step.new_key)}`
    case 'rename_structure_key':
      return `Rename the key of ${structureName(defs, String(step.structure ?? ''))} to ${text(step.new_key)}`
    case 'rename_group_key':
      return `Rename the key of ${groupName(
        defs,
        String(step.structure ?? ''),
        String(step.group ?? ''),
      )} to ${text(step.new_key)}`
    case 'rename_value_list_key':
      return `Rename the key of ${valueListName(defs, String(step.key ?? ''))} to ${text(step.new_key)}`
    case 'rename_unit_family_key':
      return `Rename the key of ${unitFamilyName(defs, String(step.key ?? ''))} to ${text(step.new_key)}`
    case 'upsert_attribute': {
      const attribute = rec(step.attribute)
      return `Save attribute ${label(attribute?.labels) || copy.attribute}`
    }
    case 'upsert_type': {
      const objectType = rec(step.object_type)
      return `Save type ${label(objectType?.singular) || label(objectType?.labels) || copy.objectType}`
    }
    case 'upsert_structure': {
      const structure = rec(step.structure)
      return `Save structure ${label(structure?.labels) || copy.structure}`
    }
    case 'upsert_unit_family': {
      const family = rec(step.family)
      return `Save unit family ${label(family?.labels) || text(family?.dimension) || copy.newUnitFamily}`
    }
    case 'upsert_catalog':
      return 'Save catalog'
    case 'delete_catalog':
      return 'Delete catalog'
    case 'upsert_merge_profile':
      return 'Save merge profile'
    case 'delete_merge_profile':
      return 'Delete merge profile'
    case 'upsert_workspace_template':
      return 'Save workspace template'
    case 'delete_workspace_template':
      return 'Delete workspace template'
    case 'set_ownership_rules':
      return 'Update ownership rules'
    case 'set_languages':
      return 'Update languages'
    default:
      return 'Change the data model'
  }
}

/** Every step in order, each with the sentence the Review dialog shows. */
export function describeModelSteps(steps: unknown, defs: Json | undefined): ModelStepText[] {
  if (!Array.isArray(steps)) return []
  return steps.flatMap((value, index) => {
    const step = rec(value)
    if (!step) return []
    const op = String(step.op ?? '')
    return [{
      key: `${index}:${op}`,
      op,
      sentence: modelStepSentence(step, defs),
      allowedTrees:
        op === 'set_structures' || (op === 'update_type' && step.structures !== undefined),
    }]
  })
}
