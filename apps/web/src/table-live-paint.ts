/**
 * While Typesense hits and pathValues refetch after a live edit, keep painting
 * the previous row so Description and Version swap in one sweep.
 */
export function shouldHoldTablePaint(input: {
  hasPaintedData: boolean
  objectsFetching: boolean
  pathBusy: boolean
}): boolean {
  return input.hasPaintedData && (input.objectsFetching || input.pathBusy)
}

/**
 * Replace the painted snapshot this render.
 * An empty snapshot taken before the first hits must not stick while pathValues
 * is still in flight, or hop cells never mount and a blocked pathValues request
 * never gets released.
 */
export function shouldRefreshTableSnapshot(input: {
  tableBusy: boolean
  hasSnapshot: boolean
  heldRowCount: number
  liveRowCount: number
}): boolean {
  if (!input.hasSnapshot || !input.tableBusy) return true
  return input.liveRowCount > 0 && input.heldRowCount === 0
}
