/** Internal row-order marker on draft row maps (see standard-editable-table). */
export const INLINE_ROW_ORDER_KEY = '__rowOrder'

/** True when this draft row is a new inline create, not an edit of a persisted row. */
export function isPendingCreateRow<T extends { id: string }>(
  rowId: string,
  persistedRows: ReadonlyArray<T>,
): boolean {
  if (rowId === INLINE_ROW_ORDER_KEY) return false
  return !persistedRows.some((row) => row.id === rowId)
}

/** First pending inline create in a draft map, if any. */
export function findPendingCreateRowId<T extends { id: string }>(
  draftRows: Record<string, T>,
  persistedRows: ReadonlyArray<T>,
): string | null {
  for (const rowId of Object.keys(draftRows)) {
    if (isPendingCreateRow(rowId, persistedRows)) return rowId
  }
  return null
}

export function removeDraftRow<T extends { id: string }>(
  draftRows: Record<string, T>,
  rowId: string,
): Record<string, T> {
  const next = { ...draftRows }
  delete next[rowId]
  const order = (draftRows as Record<string, unknown>)[INLINE_ROW_ORDER_KEY]
  if (Array.isArray(order)) {
    const filtered = order.filter((id): id is string => typeof id === 'string' && id !== rowId)
    Object.defineProperty(next, INLINE_ROW_ORDER_KEY, { value: filtered, enumerable: false, configurable: true })
  }
  return next
}

export function focusInlineCreateOpener(opener: HTMLElement | null | undefined) {
  if (opener?.isConnected) queueMicrotask(() => opener.focus())
}
