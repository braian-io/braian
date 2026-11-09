import type { Json } from './api'
import { dispatchUi } from './ui-bus'
import { readActiveColumn, readLastActiveColumn, readUiContext } from './ui-context'

export type ColumnMoveTarget = {
  column?: unknown
  viewId?: unknown
}

/**
 * Resolve one table for a column move. An explicit view wins. Otherwise the
 * column the user activated last (a header click or a cell focus) names the
 * table, even when another pane still holds document focus. When no column was
 * activated, fall back to the focused table. The result is always one view,
 * never a broadcast.
 */
export function resolveColumnMoveTarget(target: ColumnMoveTarget = {}) {
  const snapshot = readUiContext()
  const named = typeof target.viewId === 'string' ? target.viewId.trim() : ''
  const explicitColumn = typeof target.column === 'string' ? target.column : ''
  if (named) {
    return {
      viewId: named,
      column: explicitColumn || readActiveColumn(named) || undefined,
    }
  }
  const last = readLastActiveColumn()
  if (last) {
    return {
      viewId: last.viewId,
      column: explicitColumn || last.column,
    }
  }
  const focusedColumn = snapshot.focused ? readActiveColumn(snapshot.focused) : null
  if (snapshot.focused && focusedColumn) {
    return {
      viewId: snapshot.focused,
      column: explicitColumn || focusedColumn,
    }
  }
  return {
    viewId: snapshot.focused || undefined,
    column: explicitColumn || snapshot.activeColumn || undefined,
  }
}

/** The keyboard and the registry runners dispatch one explicitly targeted column move. */
export function dispatchColumnMove(direction: 'left' | 'right', target: ColumnMoveTarget = {}) {
  const resolved = resolveColumnMoveTarget(target)
  if (!resolved.column) return undefined
  return dispatchUi('ui.move_column', {
    column: resolved.column,
    direction,
    ...(resolved.viewId ? { viewId: resolved.viewId } : {}),
  })
}

/**
 * A listener applies a column move only when it names its table. A legacy
 * event without a view id follows focus instead of broadcasting to every pane.
 */
export function columnMoveAppliesTo(args: Json, viewId: string) {
  const explicit = typeof args.viewId === 'string'
    ? args.viewId
    : typeof args.view === 'string' ? args.view : ''
  if (explicit) return explicit === viewId
  const focused = readUiContext().focused
  return !focused || focused === viewId
}
