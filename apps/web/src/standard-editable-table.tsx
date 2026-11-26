import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import type { CommandTarget, MenuContext } from './command-registry'
import { openSharedContextMenu, prefersNativeContextMenu } from './shared-context-menu'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select'
import { StandardTableChrome } from './standard-table'
import { copy } from './i18n'
import { reportWriteError, writeErrorMessage } from './write-error'
import { StateNote } from './states'

export type StandardColumnType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'readonly'

export type StandardColumn<T> = {
  id: string
  header: string
  /** Header cell title (column tooltip); defaults to header. */
  headerTitle?: string
  width?: number | string
  type?: StandardColumnType
  editable?: boolean
  /** Options for enum columns. */
  options?: Array<{ value: string; label: string }>
  /** When true, enum cells edit with the themed Select instead of a native select. */
  enumSelect?: boolean
  /** Return an error message to keep the value in the editor; nothing is staged until it passes. */
  validate?: (value: string) => string | undefined
  /** When true, the cell is visibly empty and cannot be edited. */
  hideCell?: (row: T) => boolean
  read: (row: T) => string | number | boolean | null | undefined
  write?: (row: T, value: string) => T
  /** Render display cell; defaults to String(read(row)). Use 'checkbox' for a toggleable boolean. */
  display?: ((row: T) => ReactNode) | 'checkbox'
  /** Native title tooltip for the cell (e.g. full list behind +N). */
  title?: (row: T) => string
  truncate?: boolean
  /** Optional test id for the cell content, used by attribute definitions. */
  cellTestId?: (row: T) => string | undefined
}

export type EditRequest = { rowId: string; columnId: string }

export type StandardEditableTableProps<T extends { id: string }> = {
  columns: Array<StandardColumn<T>>
  rows: T[]
  /**
   * When set, cell edits and draft rows collect here until Review and save.
   * Reordering stages every row in the new order (see reorderable).
   */
  draftRows?: Record<string, T>
  onDraftRowsChange?: (next: Record<string, T>) => void
  /** Plus control. Create UI lives in the caller (a dialog), not an inline draft row. */
  onNewRow?: () => void
  newRowLabel?: string
  /** Persist all drafts (same as Ctrl+S). Omitted when `saveCell` writes each edit. */
  onReviewAndSave?: () => void | Promise<void>
  /** When set, controls the Save button instead of local draft rows alone. */
  reviewVisible?: boolean
  /**
   * Save this cell as soon as it commits (Enter, blur, Tab, checkbox, enum).
   * The table hides its Save button and shows a short saved or error note on the cell.
   */
  saveCell?: (row: T, columnId: string) => Promise<void>
  /** Save a new row order as soon as the drag or move finishes. */
  onReorder?: (ordered: T[]) => Promise<void>
  /** Called when a row is activated (click / Enter on non-edit). */
  onActivateRow?: (row: T) => void
  /**
   * Controlled active row. When omitted, the table keeps its own selection
   * so click / arrow keys still show `.standard-grid-row.on`.
   */
  activeRowId?: string | null
  filterValue?: string
  onFilterChange?: (value: string) => void
  /** Extra text matched by the toolbar filter, for values not shown in a column. */
  rowFilterText?: (row: T) => string
  filterOnKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  testId?: string
  /** Enable inline editing (Enter / F2). Off for product object table. */
  editable?: boolean
  /** Keep the toolbar but show a loading state until the first response arrives. */
  loading?: boolean
  emptyLabel?: string
  getRowTestId?: (row: T) => string
  getRowKeyAttr?: (row: T) => string | undefined
  /** Extra toolbar content under the chrome bar. */
  belowBar?: ReactNode
  /** Opens the field picker (Columns control in chrome). */
  onSelectFields?: () => void
  selectFieldsLabel?: string
  /** Per-row edit gate (e.g. lock standard attribute keys). */
  canEdit?: (row: T, column: StandardColumn<T>) => boolean
  /** Opt-in row reordering: drag handle, Move up/down and Alt+Arrow. */
  reorderable?: boolean
  /** Per-row flags: fixed rows keep their index, read-only rows are locked. */
  rowFlags?: (row: T) => { fixed?: boolean; readOnly?: boolean }
  /** Shared context menu: context for a row, or empty surface when row is null. */
  menuContext?: MenuContext | ((row: T | null) => MenuContext)
  getMenuTarget?: (row: T | null) => CommandTarget
  /** Imperative edit request (rename commands). */
  editRequest?: EditRequest | null
  onEditRequestHandled?: () => void
}

type EditCell = { rowId: string; columnId: string }

export const ROW_ORDER_KEY = '__rowOrder'

type GridRowProps = Omit<ComponentPropsWithoutRef<'div'>, 'children'> & {
  rowId: string
  children: ReactNode
  'data-testid'?: string
  'data-row-id'?: string
  'data-key'?: string
  'data-draft'?: string
  'data-readonly'?: string
}

function PlainGridRow({ rowId: _rowId, children, ...props }: GridRowProps) {
  return <div {...props}>{children}</div>
}

type SortableGridRowProps = GridRowProps & {
  disabled: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function SortableGridRow({
  rowId,
  children,
  disabled,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  ...props
}: SortableGridRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowId,
    disabled,
  })
  return (
    <div
      ref={setNodeRef}
      {...props}
      style={{
        ...props.style,
        transform: DndCSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.85 : undefined,
        zIndex: isDragging ? 2 : undefined,
      }}
    >
      <div className="standard-grid-cell standard-grid-reorder">
        <Button
          type="button"
          variant="icon"
          className="standard-grid-reorder-btn"
          aria-label="Move row up"
          title="Move row up"
          disabled={disabled || !canMoveUp}
          onClick={(event) => {
            event.stopPropagation()
            onMoveUp()
          }}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="icon"
          className="standard-grid-reorder-btn"
          aria-label="Move row down"
          title="Move row down"
          disabled={disabled || !canMoveDown}
          onClick={(event) => {
            event.stopPropagation()
            onMoveDown()
          }}
        >
          ↓
        </Button>
        <Button
          type="button"
          variant="icon"
          className="standard-grid-reorder-btn standard-grid-drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          disabled={disabled}
          {...(disabled ? {} : attributes)}
          {...(disabled ? {} : listeners)}
          onClick={(event) => event.stopPropagation()}
        >
          ⠿
        </Button>
      </div>
      {children}
    </div>
  )
}

/**
 * Generic editable grid on top of StandardTableChrome.
 * Plus adds an inline draft row; dirty drafts show Save.
 * Keyboard: Enter/F2 edit, Esc cancel, Tab next cell.
 * With reorderable: Alt+ArrowUp/Down, Move row controls and drag to reorder.
 * Right-click / Shift+F10 / ContextMenu open the shared command menu when configured.
 */
export function StandardEditableTable<T extends { id: string }>({
  columns,
  rows,
  draftRows = {},
  onDraftRowsChange,
  onNewRow,
  newRowLabel = copy.newRow,
  onReviewAndSave,
  reviewVisible: reviewVisibleProp,
  saveCell,
  onReorder,
  onActivateRow,
  activeRowId: activeRowIdProp,
  filterValue,
  onFilterChange,
  rowFilterText,
  filterOnKeyDown,
  testId = 'standard-editable-table',
  editable = true,
  loading = false,
  emptyLabel = copy.noRows,
  getRowTestId,
  getRowKeyAttr,
  belowBar,
  onSelectFields,
  selectFieldsLabel,
  canEdit,
  reorderable = false,
  rowFlags,
  menuContext,
  getMenuTarget,
  editRequest,
  onEditRequestHandled,
}: StandardEditableTableProps<T>) {
  const [editing, setEditing] = useState<EditCell | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editError, setEditError] = useState('')
  const [cellSave, setCellSave] = useState<Record<string, { state: 'saving' | 'saved' | 'error'; message?: string }>>({})
  const saveTimers = useRef<Record<string, number>>({})
  const savesInFlight = useRef(new Map<string, number>())
  // The last value sent for a row, kept until `rows` shows it. A toggle back
  // in the gap after the request resolves still has to be committed.
  const lastSent = useRef(new Map<string, T>())
  const [internalActiveRowId, setInternalActiveRowId] = useState<string | null>(null)
  const [reorderOrder, setReorderOrder] = useState<string[] | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dirty = Object.keys(draftRows).length > 0
  const autosave = Boolean(saveCell)
  const reviewVisible = autosave ? false : (reviewVisibleProp ?? dirty)
  const cellKey = (rowId: string, columnId: string) => `${rowId}:${columnId}`
  const noteSave = (rowId: string, columnId: string, state: 'saving' | 'saved' | 'error', message?: string) => {
    const key = cellKey(rowId, columnId)
    const timer = saveTimers.current[key]
    if (timer) window.clearTimeout(timer)
    delete saveTimers.current[key]
    setCellSave((current) => ({ ...current, [key]: { state, message } }))
    if (state === 'saved') {
      saveTimers.current[key] = window.setTimeout(() => {
        setCellSave((current) => {
          if (current[key]?.state !== 'saved') return current
          const next = { ...current }
          delete next[key]
          return next
        })
      }, 1600)
    }
  }
  const runSave = (row: T, columnId: string) => {
    if (!saveCell) return
    lastSent.current.set(row.id, row)
    savesInFlight.current.set(row.id, (savesInFlight.current.get(row.id) ?? 0) + 1)
    noteSave(row.id, columnId, 'saving')
    void saveCell(row, columnId).then(() => {
      noteSave(row.id, columnId, 'saved')
    }).catch((reason: unknown) => {
      noteSave(row.id, columnId, 'error', writeErrorMessage(reason) ?? copy.validation)
      const sent = lastSent.current.get(row.id)
      if (sent && sameRow(sent, row)) lastSent.current.delete(row.id)
    }).finally(() => {
      const left = (savesInFlight.current.get(row.id) ?? 1) - 1
      if (left <= 0) savesInFlight.current.delete(row.id)
      else savesInFlight.current.set(row.id, left)
    })
  }
  const controlled = activeRowIdProp !== undefined
  const activeRowId = controlled ? activeRowIdProp : internalActiveRowId
  const canReorder = Boolean(reorderable && onDraftRowsChange)

  const activateRow = useCallback(
    (row: T) => {
      if (!controlled) setInternalActiveRowId(row.id)
      onActivateRow?.(row)
    },
    [controlled, onActivateRow],
  )

  const merged = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (const [id, draft] of Object.entries(draftRows)) byId.set(id, draft)
    const base = [...byId.values()]
    if (!reorderable) return base
    const allDrafted = base.length > 0 && base.every((row) => row.id in draftRows)
    const draftOrder = (draftRows as Record<string, unknown>)[ROW_ORDER_KEY]
    const keyOrder = Array.isArray(draftOrder)
      ? draftOrder.filter((id): id is string => typeof id === 'string')
      : Object.keys(draftRows)
    const order = reorderOrder ?? (allDrafted ? keyOrder : null)
    if (!order) return base
    const ordered: T[] = []
    const seen = new Set<string>()
    for (const id of order) {
      const row = byId.get(id)
      if (!row || seen.has(row.id)) continue
      ordered.push(row)
      seen.add(row.id)
    }
    for (const row of base) if (!seen.has(row.id)) ordered.push(row)
    return ordered
  }, [rows, draftRows, reorderable, reorderOrder])

  const filtered = useMemo(() => {
    const needle = (filterValue ?? '').trim().toLowerCase()
    if (!needle) return merged
    return merged.filter((row) => {
      const extra = rowFilterText?.(row) ?? ''
      if (extra.toLowerCase().includes(needle)) return true
      return columns.some((column) => String(column.read(row) ?? '').toLowerCase().includes(needle))
    })
  }, [merged, filterValue, columns, rowFilterText])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (Object.keys(draftRows).length === 0) setReorderOrder(null)
  }, [draftRows])

  const keepRowOrder = (next: Record<string, T>) => {
    const order = (draftRows as Record<string, unknown>)[ROW_ORDER_KEY]
    if (Array.isArray(order)) {
      Object.defineProperty(next, ROW_ORDER_KEY, { value: order, enumerable: false, configurable: true })
    }
    return next
  }

  const sameCellValue = (value: string | number | boolean | null | undefined) =>
    value === null || value === undefined ? '' : String(value)
  // Semantic equality across the columns this table edits. Opening a cell and
  // confirming the same value (or toggling a checkbox back) is not a draft.
  const sameRow = (left: T, right: T) =>
    left.id === right.id
    && columns.every((column) => sameCellValue(column.read(left)) === sameCellValue(column.read(right)))

  useEffect(() => {
    for (const [id, sent] of lastSent.current) {
      const base = rows.find((row) => row.id === id)
      if (base && sameRow(base, sent)) lastSent.current.delete(id)
    }
  }, [rows, columns])

  const patchRow = useCallback(
    (rowId: string, next: T, columnId = '') => {
      if (!onDraftRowsChange && !saveCell) return
      const base = rows.find((row) => row.id === rowId)
      if (base && sameRow(next, base)) {
        // The value is back where the server was when this render started.
        // A save of the opposite value may still be in flight, or already
        // resolved while `rows` still shows the old value. Dropping the
        // follow-up would let that save land and leave the cell on the value
        // the person just toggled away from.
        const sent = lastSent.current.get(rowId)
        const sentDiffers = Boolean(sent && !sameRow(sent, next))
        if (columnId && (sentDiffers || (savesInFlight.current.get(rowId) ?? 0) > 0)) {
          if (onDraftRowsChange) onDraftRowsChange(keepRowOrder({ ...draftRows, [rowId]: next }))
          runSave(next, columnId)
          return
        }
        if (onDraftRowsChange && rowId in draftRows) {
          const without = { ...draftRows }
          delete without[rowId]
          onDraftRowsChange(keepRowOrder(without))
        }
        return
      }
      if (onDraftRowsChange) onDraftRowsChange(keepRowOrder({ ...draftRows, [rowId]: next }))
      if (columnId) runSave(next, columnId)
    },
    // sameRow and runSave read the latest columns and save handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftRows, onDraftRowsChange, rows, columns, saveCell],
  )

  const rowReadOnly = (row: T) => Boolean(rowFlags?.(row)?.readOnly)

  const columnEditable = (row: T, column: StandardColumn<T>) => {
    if (column.hideCell?.(row)) return false
    if (rowReadOnly(row)) return false
    if (!editable || column.editable === false || column.type === 'readonly' || !column.write) return false
    if (canEdit && !canEdit(row, column)) return false
    return true
  }

  const reorderSlots = useMemo(() => {
    const slots: number[] = []
    merged.forEach((row, index) => {
      if (!rowFlags?.(row)?.fixed) slots.push(index)
    })
    return slots
  }, [merged, rowFlags])

  const slotFor = (rowId: string) => {
    const index = merged.findIndex((row) => row.id === rowId)
    return index < 0 ? -1 : reorderSlots.indexOf(index)
  }

  const applyOrder = (next: T[], movedId: string) => {
    if (!onDraftRowsChange) return
    const nextDrafts: Record<string, T> = {}
    for (const row of next) nextDrafts[row.id] = draftRows[row.id] ?? row
    const ids = next.map((row) => row.id)
    Object.defineProperty(nextDrafts, ROW_ORDER_KEY, { value: ids, enumerable: false, configurable: true })
    setReorderOrder(ids)
    onDraftRowsChange(nextDrafts)
    if (!onReorder || !movedId) return
    noteSave(movedId, 'order', 'saving')
    void onReorder(next).then(() => {
      noteSave(movedId, 'order', 'saved')
    }).catch((reason: unknown) => {
      noteSave(movedId, 'order', 'error', writeErrorMessage(reason) ?? copy.validation)
    })
  }

  const moveToSlot = (row: T, targetSlot: number) => {
    if (!canReorder) return
    if (rowReadOnly(row) || rowFlags?.(row)?.fixed) return
    const sourceSlot = slotFor(row.id)
    if (sourceSlot < 0 || targetSlot < 0 || targetSlot >= reorderSlots.length) return
    if (sourceSlot === targetSlot) return
    const movable = reorderSlots.map((index) => merged[index])
    const nextMovable = arrayMove(movable, sourceSlot, targetSlot)
    const next = merged.slice()
    reorderSlots.forEach((index, position) => {
      next[index] = nextMovable[position]
    })
    applyOrder(next, row.id)
  }

  const moveRow = (row: T, delta: number) => {
    moveToSlot(row, slotFor(row.id) + delta)
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (!canReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const row = merged.find((item) => item.id === String(active.id))
    if (!row) return
    moveToSlot(row, slotFor(String(over.id)))
  }

  const beginEdit = (row: T, column: StandardColumn<T>) => {
    if (!columnEditable(row, column)) return
    if (column.display === 'checkbox') return
    setEditing({ rowId: row.id, columnId: column.id })
    const raw = column.read(row)
    setEditValue(raw === null || raw === undefined ? '' : String(raw))
    setEditError('')
  }

  useEffect(() => {
    if (!editRequest) return
    const row = merged.find((item) => item.id === editRequest.rowId)
    const column = columns.find((item) => item.id === editRequest.columnId)
    if (row && column) {
      if (column.display === 'checkbox') queueMicrotask(() => placeColumnFocus(row, column))
      else beginEdit(row, column)
    }
    onEditRequestHandled?.()
    // intentionally only when editRequest identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  const commitEdit = () => {
    if (!editing) return
    const row = merged.find((item) => item.id === editing.rowId)
    const column = columns.find((item) => item.id === editing.columnId)
    if (!row || !column?.write) {
      setEditing(null)
      setEditError('')
      return
    }
    if (column.validate) {
      const message = column.validate(editValue)
      if (message) {
        setEditError(message)
        return
      }
    }
    setEditing(null)
    setEditError('')
    const next = column.write(row, editValue)
    patchRow(row.id, next, column.id)
  }

  const cancelEdit = () => {
    setEditing(null)
    setEditError('')
  }

  const editableColumnsFor = (row: T) => columns.filter((column) => columnEditable(row, column))

  const focusCheckbox = (rowId: string, columnId: string) => {
    const control = gridRef.current?.querySelector<HTMLElement>(
      `[data-row-id="${CSS.escape(rowId)}"] [data-column="${CSS.escape(columnId)}"] [role="checkbox"]`,
    )
    if (control && !control.hasAttribute('disabled')) {
      control.focus()
      return true
    }
    return false
  }

  const focusRow = (rowId: string) => {
    gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"]`)?.focus()
  }

  /** Checkbox columns stay out of the text editor. Tab focuses an enabled control or skips a disabled one. */
  const placeColumnFocus = (row: T, column: StandardColumn<T>) => {
    if (column.display === 'checkbox') {
      if (!focusCheckbox(row.id, column.id)) focusRow(row.id)
      return
    }
    beginEdit(row, column)
  }

  const moveEdit = (row: T, column: StandardColumn<T>, delta: number) => {
    commitEdit()
    const editableColumns = editableColumnsFor(row)
    const index = editableColumns.findIndex((item) => item.id === column.id)
    const nextCol = editableColumns[index + delta]
    if (nextCol) {
      queueMicrotask(() => placeColumnFocus(row, nextCol))
      return
    }
    const rowIndex = filtered.findIndex((item) => item.id === row.id)
    const nextRow = filtered[rowIndex + (delta > 0 ? 1 : -1)]
    if (!nextRow) {
      queueMicrotask(() => focusRow(row.id))
      return
    }
    const wrapCols = editableColumnsFor(nextRow)
    const wrapCol = delta > 0 ? wrapCols[0] : wrapCols.at(-1)
    queueMicrotask(() => {
      if (wrapCol) placeColumnFocus(nextRow, wrapCol)
      else focusRow(row.id)
    })
  }

  const onReview = () => {
    void Promise.resolve(onReviewAndSave?.()).catch((reason: unknown) => {
      reportWriteError(reason)
    })
  }

  useEffect(() => {
    if (!editable || !onReviewAndSave) return
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return
      if (!reviewVisible) return
      event.preventDefault()
      void Promise.resolve(onReviewAndSave()).catch((reason: unknown) => {
        reportWriteError(reason)
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable, reviewVisible, onReviewAndSave])

  const resolveContext = (row: T | null): MenuContext | null => {
    if (!menuContext) return null
    return typeof menuContext === 'function' ? menuContext(row) : menuContext
  }

  const openMenu = (row: T | null, x: number, y: number) => {
    const context = resolveContext(row)
    if (!context) return
    if (row) activateRow(row)
    openSharedContextMenu({
      context,
      x,
      y,
      target: getMenuTarget?.(row) ?? {},
    })
  }

  const onRowContextMenu = (event: ReactMouseEvent<HTMLElement>, row: T) => {
    if (!menuContext || prefersNativeContextMenu(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    // Same as Shift+F10: open under the row so the clicked cells stay readable (H6).
    const box = event.currentTarget.getBoundingClientRect()
    openMenu(row, event.clientX, box.bottom)
  }

  const onRowKey = (event: ReactKeyboardEvent<HTMLElement>, row: T) => {
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      if (!menuContext) return
      event.preventDefault()
      const box = event.currentTarget.getBoundingClientRect()
      openMenu(row, box.left, box.bottom)
      return
    }
    if (editing) return
    if (canReorder && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      moveRow(row, event.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const index = filtered.findIndex((item) => item.id === row.id)
      if (index < 0) return
      const next = filtered[index + (event.key === 'ArrowDown' ? 1 : -1)]
      if (!next) return
      event.preventDefault()
      activateRow(next)
      const grid = event.currentTarget.parentElement
      queueMicrotask(() => {
        const el = grid?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(next.id)}"]`)
        el?.focus()
      })
      return
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      const column = editableColumnsFor(row)[0]
      if (!column) {
        if (event.key === 'Enter') activateRow(row)
        return
      }
      event.preventDefault()
      if (column.display === 'checkbox') queueMicrotask(() => placeColumnFocus(row, column))
      else beginEdit(row, column)
    }
  }

  const gridRows = filtered.map((row) => {
    const isDraft = Boolean(draftRows[row.id]) && !rows.some((item) => item.id === row.id)
    const readOnly = rowReadOnly(row)
    const fixed = Boolean(rowFlags?.(row)?.fixed)
    const movable = canReorder && !readOnly && !fixed
    const sourceSlot = slotFor(row.id)
    const canMoveUp = movable && sourceSlot > 0
    const canMoveDown = movable && sourceSlot >= 0 && sourceSlot < reorderSlots.length - 1
    const classes = ['standard-grid-row']
    if (activeRowId === row.id) classes.push('on')
    if (isDraft) classes.push('draft')
    if (readOnly) classes.push('read-only')
    const rowProps: Omit<GridRowProps, 'rowId' | 'children'> = {
      className: classes.join(' '),
      role: 'row',
      tabIndex: 0,
      'data-testid': getRowTestId?.(row) ?? 'standard-grid-row',
      'data-row-id': row.id,
      'data-key': getRowKeyAttr?.(row),
      'data-draft': isDraft ? 'true' : undefined,
      'data-readonly': readOnly ? 'true' : undefined,
      onClick: () => activateRow(row),
      onContextMenu: (event) => onRowContextMenu(event, row),
      onKeyDown: (event) => onRowKey(event, row),
    }
    const cells = columns.map((column) => {
      if (column.hideCell?.(row)) {
        return (
          <div
            key={column.id}
            className="standard-grid-cell"
            role="gridcell"
            data-column={column.id}
            data-disabled="true"
            style={column.width ? { width: column.width, flex: 'none', minWidth: column.width } : undefined}
          />
        )
      }
      const isEditing = editing?.rowId === row.id && editing.columnId === column.id
      const raw = column.read(row)
      const readText = raw === null || raw === undefined ? '' : String(raw)
      const cellTitle = column.title?.(row) || readText
      const cellTestId = column.cellTestId?.(row)
      const boolCell = column.display === 'checkbox'
      const editableCell = columnEditable(row, column)
      const editableBool = boolCell && editableCell
      const cellClass = [
        'standard-grid-cell',
        column.truncate ? 'truncate' : '',
        boolCell ? 'standard-grid-cell-bool' : '',
        isEditing ? 'standard-grid-cell-editing' : '',
      ]
        .filter(Boolean)
        .join(' ')
      const directSave = cellSave[cellKey(row.id, column.id)]
      const orderSave = columns[0]?.id === column.id ? cellSave[cellKey(row.id, 'order')] : undefined
      const saveNote = directSave ?? orderSave
      const rowHasSaveNote = columns.some((item) => cellSave[cellKey(row.id, item.id)])
        || cellSave[cellKey(row.id, 'order')] !== undefined
      const restoredUnsaved = !saveNote
        && !rowHasSaveNote
        && autosave
        && columns[0]?.id === column.id
        && Boolean(draftRows[row.id])
        && rows.some((item) => item.id === row.id)
      const retrySave = () => {
        if (orderSave?.state === 'error' && onReorder) {
          noteSave(row.id, 'order', 'saving')
          void onReorder(merged).then(() => {
            noteSave(row.id, 'order', 'saved')
          }).catch((reason: unknown) => {
            noteSave(row.id, 'order', 'error', writeErrorMessage(reason) ?? copy.validation)
          })
          return
        }
        runSave(row, column.id)
      }
      return (
        <div
          key={column.id}
          className={cellClass}
          role="gridcell"
          data-column={column.id}
          data-disabled={!editableCell ? 'true' : undefined}
          style={column.width ? { width: column.width, flex: 'none', minWidth: column.width } : undefined}
          title={isEditing ? undefined : cellTitle || undefined}
          onDoubleClick={() => beginEdit(row, column)}
        >
          {isEditing ? (
            column.type === 'enum' && column.options && column.enumSelect ? (
              <div className="standard-cell-editor-stack">
                <Select
                  value={editValue || undefined}
                  onValueChange={(value) => {
                    setEditValue(value)
                    setEditError('')
                    if (!column.write) return
                    patchRow(row.id, column.write(row, value), column.id)
                    setEditing(null)
                  }}
                >
                  <SelectTrigger
                    data-testid={cellTestId ?? 'standard-cell-editor'}
                    aria-label={column.header}
                    className="standard-cell-select-trigger"
                  >
                    <SelectValue placeholder={copy.noValue} />
                  </SelectTrigger>
                  <SelectContent>
                    {column.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editError ? <span className="cell-edit-error">{editError}</span> : null}
              </div>
            ) : column.type === 'enum' && column.options ? (
              <div className="standard-cell-editor-stack">
                <select
                  ref={(node) => {
                    inputRef.current = node
                  }}
                  data-testid={cellTestId ?? 'standard-cell-editor'}
                  value={editValue}
                  onChange={(event) => setEditValue(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelEdit()
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      commitEdit()
                    } else if (event.key === 'Tab') {
                      event.preventDefault()
                      moveEdit(row, column, event.shiftKey ? -1 : 1)
                    }
                  }}
                >
                  {column.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {editError ? <span className="cell-edit-error">{editError}</span> : null}
              </div>
            ) : column.type === 'boolean' ? (
              <input
                ref={(node) => {
                  inputRef.current = node
                }}
                type="checkbox"
                data-testid={cellTestId ?? 'standard-cell-editor'}
                checked={editValue === 'true'}
                onChange={(event) => {
                  const next = event.target.checked ? 'true' : 'false'
                  setEditValue(next)
                  if (!column.write) return
                  patchRow(row.id, column.write(row, next), column.id)
                  setEditing(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEdit()
                  } else if (event.key === 'Tab') {
                    event.preventDefault()
                    moveEdit(row, column, event.shiftKey ? -1 : 1)
                  }
                }}
              />
            ) : (
              <div className="standard-cell-editor-stack">
                <input
                  ref={(node) => {
                    inputRef.current = node
                  }}
                  data-testid={cellTestId ?? 'standard-cell-editor'}
                  aria-label={column.header}
                  type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : column.type === 'datetime' ? 'datetime-local' : 'text'}
                  value={editValue}
                  onChange={(event) => {
                    setEditValue(event.target.value)
                    if (editError) setEditError('')
                  }}
                  onBlur={() => {
                    if (column.validate?.(editValue)) return
                    commitEdit()
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelEdit()
                    } else if (event.key === 'Enter') {
                      event.preventDefault()
                      commitEdit()
                    } else if (event.key === 'Tab') {
                      event.preventDefault()
                      moveEdit(row, column, event.shiftKey ? -1 : 1)
                    }
                  }}
                />
                {editError ? <span className="cell-edit-error">{editError}</span> : null}
              </div>
            )
          ) : column.display === 'checkbox' ? (
            <Checkbox
              data-testid={cellTestId}
              aria-label={column.header}
              checked={raw === true}
              disabled={!editableBool}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key !== 'Tab' || !editableBool) return
                event.preventDefault()
                moveEdit(row, column, event.shiftKey ? -1 : 1)
              }}
              onCheckedChange={(value) => {
                if (!column.write || !editableBool) return
                patchRow(row.id, column.write(row, value === true ? 'true' : 'false'), column.id)
              }}
            />
          ) : column.display ? (
            <span data-testid={cellTestId}>{column.display(row)}</span>
          ) : column.type === 'boolean' ? (
            <span data-testid={cellTestId}>{raw === true ? copy.yes : '—'}</span>
          ) : (
            <span data-testid={cellTestId}>{readText || (column.display ? '' : '—')}</span>
          )}
          {saveNote?.state === 'saving' ? (
            <span className="cell-save-note" data-testid="cell-save-state" data-state="saving">{copy.saving}</span>
          ) : null}
          {saveNote?.state === 'saved' ? (
            <span className="cell-save-note" data-testid="cell-save-state" data-state="saved">{copy.saved}</span>
          ) : null}
          {saveNote?.state === 'error' || restoredUnsaved ? (
            <span className="cell-save-note" data-testid="cell-save-state" data-state="error">
              <span className="cell-edit-error" role="alert">{saveNote?.message || copy.validation}</span>
              <Button type="button" variant="ghost" data-testid="cell-save-retry" onClick={(event) => { event.stopPropagation(); retrySave() }}>
                {copy.agentRetry}
              </Button>
            </span>
          ) : null}
        </div>
      )
    })
    return canReorder ? (
      <SortableGridRow
        key={row.id}
        rowId={row.id}
        disabled={!movable}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onMoveUp={() => moveRow(row, -1)}
        onMoveDown={() => moveRow(row, 1)}
        {...rowProps}
      >
        {cells}
      </SortableGridRow>
    ) : (
      <PlainGridRow key={row.id} rowId={row.id} {...rowProps}>
        {cells}
      </PlainGridRow>
    )
  })

  return (
    <StandardTableChrome
      testId={testId}
      newRowLabel={newRowLabel}
      onNewRow={onNewRow}
      onSelectFields={onSelectFields}
      selectFieldsLabel={selectFieldsLabel}
      rowCount={filtered.length}
      filterValue={filterValue}
      onFilterChange={onFilterChange}
      filterOnKeyDown={filterOnKeyDown}
      reviewVisible={editable && reviewVisible}
      onReview={onReview}
    >
      {belowBar}
      <div
        className="standard-grid"
        role="grid"
        aria-rowcount={filtered.length}
        ref={gridRef}
      >
        <div className="standard-grid-head" role="row">
          {canReorder ? (
            <div className="standard-grid-cell standard-grid-reorder-head" aria-hidden="true" />
          ) : null}
          {columns.map((column) => (
            <div
              key={column.id}
              className={column.truncate ? 'standard-grid-cell column-head truncate' : 'standard-grid-cell column-head'}
              role="columnheader"
              data-column={column.id}
              title={column.headerTitle ?? column.header}
              style={column.width ? { width: column.width, flex: 'none', minWidth: column.width } : undefined}
            >
              {column.header}
            </div>
          ))}
        </div>
        {loading ? (
          <StateNote className="standard-grid-empty" tone="loading" title={copy.loading} testId="standard-grid-loading" />
        ) : filtered.length === 0 ? (
          <StateNote className="standard-grid-empty" tone="empty" title={emptyLabel} testId="standard-grid-empty" />
        ) : null}
        {canReorder ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={filtered.map((row) => row.id)} strategy={verticalListSortingStrategy}>
              {gridRows}
            </SortableContext>
          </DndContext>
        ) : (
          gridRows
        )}
      </div>
    </StandardTableChrome>
  )
}
