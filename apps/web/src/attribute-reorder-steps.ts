import type { ModelSelection } from './model-view'
import { ROW_ORDER_KEY } from './standard-editable-table'

export type ReorderableAttributeRow = { id: string; key: string; label: string; inherited?: boolean; standard?: boolean }

export function buildAttributeReorderStep(
  selection: ModelSelection,
  serverRows: ReorderableAttributeRow[],
  draftRows: Record<string, ReorderableAttributeRow>,
): { op: string } & Record<string, unknown> | null {
  const order = (draftRows as Record<string, unknown>)[ROW_ORDER_KEY]
  if (!Array.isArray(order)) return null
  const byId = new Map<string, ReorderableAttributeRow>()
  for (const row of serverRows) byId.set(row.id, draftRows[row.id] ?? row)
  for (const [id, row] of Object.entries(draftRows)) if (id !== ROW_ORDER_KEY) byId.set(id, row)
  const seen = new Set<string>()
  const desired: ReorderableAttributeRow[] = []
  for (const id of order) {
    if (typeof id !== 'string') continue
    const row = byId.get(id)
    if (!row || seen.has(row.id)) continue
    seen.add(row.id)
    desired.push(row)
  }
  for (const row of serverRows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    desired.push(draftRows[row.id] ?? row)
  }
  for (const row of Object.values(draftRows)) {
    if ((row as { id?: string }).id === ROW_ORDER_KEY) continue
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    desired.push(row)
  }
  const movable = serverRows.filter((row) => !row.inherited)
  const attributes = desired
    .filter((row) => movable.some((item) => item.id === row.id))
    .map((row) => row.key.trim())
    .filter(Boolean)
  if (attributes.length === 0) return null
  const current = movable.map((row) => row.key)
  const existing = attributes.filter((key) => current.includes(key))
  if (existing.join('\u0000') === current.join('\u0000')) return null
  if (selection.kind === 'type') {
    return { op: 'reorder_type_attributes', type_key: selection.typeKey, attributes: existing }
  }
  return {
    op: 'reorder_attributes',
    structure: selection.structure,
    group: selection.group,
    attributes: existing,
  }
}