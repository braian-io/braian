import { registerCommandRunner } from './command-registry'
import type { Json } from './api'
import { attributeByKey } from './index-fields'
import { isHopPath } from './column-prefs'
import { parseColumnId } from './fields/columns'
import { optionLabel, typeLabel } from './chips'
import { readPathFromDoc, summarizePathValues } from './path-cell'
import { cellPathValues, type PathValuesResponse } from './path-values'

export const REQUEST_TABLE_COPY = 'braian:request-table-copy'

export type TableCopyRequest = { viewId: string; ids: string[] }

let commandRegistered = false

/** Dispatch so the matching object table builds TSV (workspace may host several tables). */
export function requestTableCopyText(viewId: string, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))]
  if (!viewId || unique.length === 0 || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<TableCopyRequest>(REQUEST_TABLE_COPY, {
    detail: { viewId, ids: unique },
  }))
}

export function ensureTableCopyCommandRunner(): void {
  if (commandRegistered || typeof window === 'undefined') return
  commandRegistered = true
  registerCommandRunner('table:copy-text', (target) => {
    const viewId = String(target.viewId ?? '')
    const rows = Array.isArray(target.objects) ? target.objects : []
    const ids = rows
      .map((row) => (row && typeof row === 'object' ? String((row as Record<string, unknown>).id ?? '') : ''))
      .filter(Boolean)
    if (ids.length === 0 && target.objectId) ids.push(String(target.objectId))
    if (!viewId || ids.length === 0) return
    requestTableCopyText(viewId, ids)
  })
}

export type TableCopyRow = {
  id: string
  key: string
  type: string
  version: string
  name: string
  status: string
  doc: Json
}

/** Excel-style TSV field quoting when the value contains tab, newline, or double quote. */
export function escapeTsvCell(value: string): string {
  if (!/[\t\n\r"]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

function columnNeedsPathValues(id: string, defs: Json | undefined): boolean {
  if (isHopPath(id)) return true
  const { path, qualifiers } = parseColumnId(id)
  if (qualifiers.some((q) => q.kind === 'unit' || q.kind === 'cardinality')) return true
  if (path.includes('@')) return true
  const key = (path.split('.')[0] ?? path).split('@')[0] ?? path
  if (key === 'number' || key === 'name' || key === 'key' || key === 'type' || key === 'version' || key === 'status') {
    return false
  }
  const attr = attributeByKey(defs, key)
  if (!attr) return false
  if (attr.language_dependent) return true
  const index = attr.index as { filterable?: boolean; sortable?: boolean } | undefined
  if (index && !index.filterable && !index.sortable) return true
  return false
}

export function plainTableCellText(
  row: TableCopyRow,
  columnId: string,
  defs: Json | undefined,
  pathValues: PathValuesResponse | undefined,
  language: string,
): string {
  if (columnId === 'key' || columnId === 'number') return row.key
  if (columnId === 'name') return row.name
  if (columnId === 'type') return typeLabel(defs, row.type, language)
  if (columnId === 'status') return optionLabel(defs, 'status', row.status, language).trim()
  if (columnId === 'version') return String(row.version ?? '')
  if (columnNeedsPathValues(columnId, defs)) {
    const values = cellPathValues(pathValues?.values?.[row.id], columnId)
    return summarizePathValues(values).text
  }
  return readPathFromDoc(row.doc, defs, parseColumnId(columnId).path)
}

export function buildTableCopyTsv(input: {
  columns: string[]
  headers: string[]
  rowsInOrder: TableCopyRow[]
  selectedIds: string[]
  defs: Json | undefined
  pathValues: PathValuesResponse | undefined
  language: string
}): string {
  const selected = new Set(input.selectedIds.filter(Boolean))
  const lines: string[] = []
  lines.push(input.headers.map(escapeTsvCell).join('\t'))
  for (const row of input.rowsInOrder) {
    if (!selected.has(row.id)) continue
    const cells = input.columns.map((columnId) =>
      escapeTsvCell(plainTableCellText(row, columnId, input.defs, input.pathValues, input.language)),
    )
    lines.push(cells.join('\t'))
  }
  return `${lines.join('\n')}\n`
}