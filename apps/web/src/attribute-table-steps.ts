import { copy } from './i18n'
import { attributeConflict, attributeKey, type AttributeRow } from './model-view'
import type { Json } from './api'

export type AttributeStepRow = AttributeRow & {
  standard: boolean
  multiple: boolean
  min: string
  max: string
  valueList: string
  integer: boolean
  maxLength: string
  textForm: string
  media: boolean
}

export function buildAttributeCreateSteps(
  defs: Json | undefined,
  row: AttributeStepRow,
  attach: { op: string; attribute: string; type_key?: string; structure?: string; group?: string },
) {
  const label = row.label.trim()
  const key = row.key.trim() || attributeKey(label)
  if (!label || !key) return [] as Array<{ op: string } & Record<string, unknown>>
  const unit = row.kind === 'number' || row.kind === 'range' ? row.unit : ''
  if (attributeConflict(defs, key, row.kind, unit)) throw new Error(copy.conflictAttribute)
  const exists = ((defs?.attributes as Json[]) ?? []).some((item) => String(item.key) === key)
  const steps: Array<{ op: string } & Record<string, unknown>> = []
  if (!exists) {
    steps.push({
      op: 'create_attribute',
      key,
      label,
      kind: row.kind,
      ...(unit ? { unit } : {}),
      multiple: row.multiple,
      languages: row.kind === 'text' ? row.languages : false,
      required: row.required,
      show_by_default: row.showByDefault,
      searchable: row.searchable,
      filterable: row.filterable,
      sortable: row.sortable,
      ...(row.kind === 'number' && row.min.trim() ? { min: row.min.trim() } : {}),
      ...(row.kind === 'number' && row.max.trim() ? { max: row.max.trim() } : {}),
      ...(row.kind === 'number' && row.integer ? { integer: true } : {}),
      ...(row.kind === 'text' && row.maxLength.trim() ? { max_length: Number(row.maxLength.trim()) } : {}),
      ...(row.kind === 'text' && row.textForm ? { text_form: row.textForm } : {}),
      ...(row.kind === 'file_ref' && row.media ? { media: true } : {}),
      ...(row.kind === 'value_list' && row.valueList ? { value_list: row.valueList } : {}),
    })
  }
  steps.push(attach)
  return steps
}

export function buildAttributeUpdateSteps(
  defs: Json | undefined,
  original: AttributeStepRow,
  row: AttributeStepRow,
  keyAttributeId: string,
) {
  void defs
  const steps: Array<{ op: string } & Record<string, unknown>> = []
  const patch: Json = {}
  const nextKey = row.key.trim()
  const canRenameKey = !original.standard && original.id !== keyAttributeId
  if (canRenameKey && nextKey && nextKey !== original.key) {
    steps.push({ op: 'rename_attribute_key', key: original.key, new_key: nextKey })
  }
  const key = canRenameKey && nextKey ? nextKey : original.key
  const label = row.label.trim()
  if (label && label !== original.label) patch.label = label
  if (row.kind !== original.kind) {
    patch.kind = row.kind
    if (row.kind !== 'number' && row.kind !== 'range') patch.clear_unit = true
  }
  const unitKind = row.kind === 'number' || row.kind === 'range'
  if (unitKind && row.unit !== original.unit) {
    if (row.unit) patch.unit = row.unit
    else patch.clear_unit = true
  }
  if (row.required !== original.required) patch.required = row.required
  if (row.showByDefault !== original.showByDefault) patch.show_by_default = row.showByDefault
  if (row.languages !== original.languages) patch.languages = row.languages
  if (row.searchable !== original.searchable) patch.searchable = row.searchable
  if (row.filterable !== original.filterable) patch.filterable = row.filterable
  if (row.sortable !== original.sortable) patch.sortable = row.sortable
  if (row.multiple !== original.multiple) patch.multiple = row.multiple
  if (row.kind === 'number') {
    if (row.min !== original.min) {
      if (row.min.trim()) patch.min = row.min.trim()
      else if (original.min) patch.clear_min = true
    }
    if (row.max !== original.max) {
      if (row.max.trim()) patch.max = row.max.trim()
      else if (original.max) patch.clear_max = true
    }
    if (row.integer !== original.integer) patch.integer = row.integer
  }
  if (row.kind === 'text') {
    if (row.maxLength !== original.maxLength) {
      if (row.maxLength.trim()) patch.max_length = Number(row.maxLength.trim())
      else if (original.maxLength) patch.clear_max_length = true
    }
    if (row.textForm !== original.textForm) {
      if (row.textForm) patch.text_form = row.textForm
      else if (original.textForm) patch.text_form = 'short'
    }
  }
  if (row.kind === 'file_ref' && row.media !== original.media) patch.media = row.media
  if (row.kind === 'value_list' && row.valueList !== original.valueList) {
    if (row.valueList) patch.value_list = row.valueList
    else if (original.valueList) patch.clear_value_list = true
  }
  if (Object.keys(patch).length > 0) steps.push({ op: 'update_attribute', key, ...patch })
  return steps
}