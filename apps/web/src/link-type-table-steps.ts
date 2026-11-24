import { attributeKey } from './model-view'
import type { LinkTypeRow } from './link-type-view'

function sideKeys(row: LinkTypeRow) {
  const fromKey = attributeKey(row.fromLabel) || `${row.key}_from`
  const toKey = attributeKey(row.toLabel) || `${row.key}_to`
  return { fromKey, toKey }
}

export function buildLinkTypeCreateSteps(row: LinkTypeRow) {
  const key = row.key.trim() || attributeKey(row.fromLabel || row.toLabel)
  if (!key || !row.fromType || !row.toType) return [] as Array<{ op: string } & Record<string, unknown>>
  const { fromKey, toKey } = sideKeys(row)
  const label = row.fromLabel.trim() || row.toLabel.trim() || key
  return [{
    op: 'create_link_type',
    key,
    label,
    from_types: [row.fromType],
    to_types: [row.toType],
    from_key: fromKey,
    from_label: row.fromLabel.trim() || label,
    to_key: toKey,
    to_label: row.toLabel.trim() || label,
    from_cardinality: row.fromCardinality,
    to_cardinality: row.toCardinality,
    attributes: [],
  }]
}

export function buildLinkTypeUpdateSteps(original: LinkTypeRow, row: LinkTypeRow) {
  const steps: Array<{ op: string } & Record<string, unknown>> = []
  const key = original.key
  if (!key) return steps
  const patch: Record<string, unknown> = { op: 'update_link_type', key }
  let dirty = false
  if (row.fromType && row.fromType !== original.fromType) {
    patch.from_types = [row.fromType]
    dirty = true
  }
  if (row.toType && row.toType !== original.toType) {
    patch.to_types = [row.toType]
    dirty = true
  }
  if (row.fromLabel.trim() !== original.fromLabel.trim()) {
    patch.from_label = row.fromLabel.trim()
    const { fromKey } = sideKeys({ ...row, key })
    patch.from_key = fromKey
    dirty = true
  }
  if (row.toLabel.trim() !== original.toLabel.trim()) {
    patch.to_label = row.toLabel.trim()
    const { toKey } = sideKeys({ ...row, key })
    patch.to_key = toKey
    dirty = true
  }
  if (row.fromCardinality !== original.fromCardinality) {
    patch.from_cardinality = row.fromCardinality
    dirty = true
  }
  if (row.toCardinality !== original.toCardinality) {
    patch.to_cardinality = row.toCardinality
    dirty = true
  }
  if (row.key.trim() && row.key.trim() !== original.key) {
    steps.push({ op: 'rename_type_key', key: original.key, new_key: row.key.trim() })
  }
  if (dirty) steps.push(patch)
  return steps
}