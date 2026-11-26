import type { Json } from './api'
import { ROW_ORDER_KEY } from './standard-editable-table'

export type ValueListOptionRow = { id: string; code: string; label: string }

export function orderedValueListOptions(
  serverRows: ValueListOptionRow[],
  draftRows: Record<string, ValueListOptionRow>,
): ValueListOptionRow[] {
  const byId = new Map<string, ValueListOptionRow>()
  for (const row of serverRows) byId.set(row.id, row)
  for (const row of Object.values(draftRows)) {
    if ((row as { id?: string }).id === ROW_ORDER_KEY) continue
    if (row?.id) byId.set(row.id, row)
  }
  const order = (draftRows as Record<string, unknown>)[ROW_ORDER_KEY]
  const seen = new Set<string>()
  const out: ValueListOptionRow[] = []
  if (Array.isArray(order)) {
    for (const id of order) {
      if (typeof id !== 'string') continue
      const row = byId.get(id)
      if (!row || seen.has(row.id)) continue
      seen.add(row.id)
      out.push(row)
    }
  }
  for (const row of serverRows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    out.push(draftRows[row.id] ?? row)
  }
  for (const [entryId, row] of Object.entries(draftRows)) {
    if (entryId === ROW_ORDER_KEY) continue
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    out.push(row)
  }
  return out
}

export function valueListOptionsOrderChanged(
  serverRows: ValueListOptionRow[],
  draftRows: Record<string, ValueListOptionRow>,
): boolean {
  const order = (draftRows as Record<string, unknown>)[ROW_ORDER_KEY]
  if (!Array.isArray(order)) return false
  const serverIds = serverRows.map((row) => row.id)
  const desiredIds = orderedValueListOptions(serverRows, draftRows).map((row) => row.id)
  return serverIds.join('\u0000') !== desiredIds.join('\u0000')
}

export function buildValueListOptionsPayload(
  ordered: ValueListOptionRow[],
): Array<{ code: string; label: string }> {
  return ordered.map((row) => ({ code: row.code, label: row.label }))
}

export function buildValueListReorderStep(
  listKey: string,
  serverRows: ValueListOptionRow[],
  draftRows: Record<string, ValueListOptionRow>,
): { op: 'update_value_list'; key: string; options: Array<{ code: string; label: string }> } | null {
  if (!valueListOptionsOrderChanged(serverRows, draftRows)) return null
  const options = buildValueListOptionsPayload(orderedValueListOptions(serverRows, draftRows))
  if (options.length === 0) return null
  return { op: 'update_value_list', key: listKey, options }
}

export function valueListOptionSteps(
  listKey: string,
  serverRows: ValueListOptionRow[],
  draftRows: Record<string, ValueListOptionRow>,
  language: string,
): Array<{ op: string } & Record<string, unknown>> {
  const steps: Array<{ op: string } & Record<string, unknown>> = []
  const ordered = orderedValueListOptions(serverRows, draftRows)
  const orderChanged = valueListOptionsOrderChanged(serverRows, draftRows)
  for (const [entryId, row] of Object.entries(draftRows)) {
    if (entryId === ROW_ORDER_KEY || !row?.id) continue
    const existing = serverRows.find((item) => item.id === row.id)
    if (!existing) {
      steps.push({
        op: 'add_value_option',
        value_list: listKey,
        option: row.code || row.label.toLowerCase().replace(/\s+/g, '_'),
        label: row.label,
        language,
      })
      continue
    }
    const optionId = row.id.split(':').pop()
    const codeChanged = row.code !== optionId
    const labelChanged = row.label !== existing.label
    if (!labelChanged && !codeChanged) continue
    steps.push({
      op: 'update_value_option',
      value_list: listKey,
      option: optionId,
      label: row.label,
      language,
      ...(codeChanged ? { new_code: row.code } : {}),
    })
  }
  if (orderChanged) {
    steps.push({
      op: 'update_value_list',
      key: listKey,
      options: buildValueListOptionsPayload(ordered),
    })
  }
  return steps
}

export function valueListLabel(defs: Json | undefined, key: string, language: string): string {
  if (!key) return ''
  const list = ((defs?.value_lists as Json[] | undefined) ?? []).find((item) => String(item.key) === key)
  if (!list) return key
  const labels = (list.labels as Record<string, string> | undefined) ?? {}
  return String(labels[language] ?? labels.en ?? labels.sv ?? key)
}