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
import { StandardTableChrome } from './standard-table'
import { copy } from './i18n'
import { reportWriteError } from './write-error'
import {
  findPendingCreateRowId,
  focusInlineCreateOpener,
  isPendingCreateRow,
  removeDraftRow,
} from './inline-create'

export type StandardColumnType = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'readonly'

export type StandardColumn<T> = {
  id: string
  header: string
  width?: number | string
  type?: StandardColumnType
  editable?: boolean
  /** Options for enum columns. */
  options?: Array<{ value: string; label: string }>
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
  /** New blank row factory for the plus control. */
  createDraftRow?: () => T
  newRowLabel?: string
  /** Persist all drafts (same as Ctrl+S). */
  onReviewAndSave?: () => void | Promise<void>
  /** Called when a row is activated (click / Enter on non-edit). */
  onActivateRow?: (row: T) => void
  /**
   * Controlled active row. When omitted, the table keeps its own selection
   * so click / arrow keys still show `.standard-grid-row.on`.
   */
  activeRowId?: string | null
  filterValue?: string
  onFilterChange?: (value: string) => void
  testId?: string
  /** Enable inline editing (Enter / F2). Off for product object table. */
  editable?: boolean
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
        <button
          type="button"
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
        </button>
        <button
          type="button"
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
        </button>
        <button
          type="button"
          className="standard-grid-reorder-btn standard-grid-drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          disabled={disabled}
          {...(disabled ? {} : attributes)}
          {...(disabled ? {} : listeners)}
          onClick={(event) => event.stopPropagation()}
        >
          ⠿
        </button>
      </div>
      {children}
    </div>
  )
}

/**
 * Generic editable grid on top of StandardTableChrome.
 * Plus adds an inline draft row; dirty drafts show Review and save.
 * Keyboard: Enter/F2 edit, Esc cancel, Tab next cell.
 * With reorderable: Alt+ArrowUp/Down, Move row controls and drag to reorder.
 * Right-click / Shift+F10 / ContextMenu open the shared command menu when configured.
 */
export function StandardEditableTable<T extends { id: string }>({
  columns,
  rows,
  draftRows = {},
  onDraftRowsChange,
  createDraftRow,
  newRowLabel = copy.newRow,
  onReviewAndSave,
  onActivateRow,
  activeRowId: activeRowIdProp,
  filterValue,
  onFilterChange,
  testId = 'standard-editable-table',
  editable = true,
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
  const [internalActiveRowId, setInternalActiveRowId] = useState<string | null>(null)
  const [reorderOrder, setReorderOrder] = useState<string[] | null>(null)
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)
  const createOpenerRef = useRef<HTMLElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dirty = Object.keys(draftRows).length > 0
  const pendingCreateId = findPendingCreateRowId(draftRows, rows)
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
    return merged.filter((row) =>
      columns.some((column) => String(column.read(row) ?? '').toLowerCase().includes(needle)),
    )
  }, [merged, filterValue, columns])

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

  const patchRow = useCallback(
    (rowId: string, next: T) => {
      if (!onDraftRowsChange) return
      onDraftRowsChange(keepRowOrder({ ...draftRows, [rowId]: next }))
    },
    [draftRows, onDraftRowsChange],
  )

  const rowReadOnly = (row: T) => Boolean(rowFlags?.(row)?.readOnly)

  const columnEditable = (row: T, column: StandardColumn<T>) => {
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

  const applyOrder = (next: T[]) => {
    if (!onDraftRowsChange) return
    const nextDrafts: Record<string, T> = {}
    for (const row of next) nextDrafts[row.id] = draftRows[row.id] ?? row
    const ids = next.map((row) => row.id)
    Object.defineProperty(nextDrafts, ROW_ORDER_KEY, { value: ids, enumerable: false, configurable: true })
    setReorderOrder(ids)
    onDraftRowsChange(nextDrafts)
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
    applyOrder(next)
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
    setEditing({ rowId: row.id, columnId: column.id })
    const raw = column.read(row)
    setEditValue(raw === null || raw === undefined ? '' : String(raw))
  }

  useEffect(() => {
    if (!editRequest) return
    const row = merged.find((item) => item.id === editRequest.rowId)
    const column = columns.find((item) => item.id === editRequest.columnId)
    if (row && column) beginEdit(row, column)
    onEditRequestHandled?.()
    // intentionally only when editRequest identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  const commitEdit = () => {
    if (!editing) return
    const row = merged.find((item) => item.id === editing.rowId)
    const column = columns.find((item) => item.id === editing.columnId)
    setEditing(null)
    if (!row || !column?.write) return
    const next = column.write(row, editValue)
    patchRow(row.id, next)
  }

  const cancelEdit = () => setEditing(null)

  const rememberCreateOpener = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('[data-testid="table-add-row"]')) {
      createOpenerRef.current = active
      return
    }
    const root = gridRef.current?.closest('[data-testid]')
    const add = root?.querySelector<HTMLElement>('[data-testid="table-add-row"]') ?? null
    createOpenerRef.current = add
  }

  const focusPendingCreateRow = (rowId: string) => {
    const row = merged.find((item) => item.id === rowId)
    if (!row) return
    activateRow(row)
    queueMicrotask(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(rowId)}"]`)
      el?.focus()
    })
  }

  const cancelInlineCreate = useCallback(() => {
    if (!pendingCreateId || !onDraftRowsChange) return
    setEditing(null)
    onDraftRowsChange(removeDraftRow(draftRows, pendingCreateId))
    if (!controlled && activeRowId === pendingCreateId) setInternalActiveRowId(null)
    focusInlineCreateOpener(createOpenerRef.current)
  }, [pendingCreateId, onDraftRowsChange, draftRows, controlled, activeRowId])

  const editableColumnsFor = (row: T) => columns.filter((column) => columnEditable(row, column))

  const moveEdit = (row: T, column: StandardColumn<T>, delta: number) => {
    commitEdit()
    const editableColumns = editableColumnsFor(row)
    const index = editableColumns.findIndex((item) => item.id === column.id)
    const nextCol = editableColumns[index + delta]
    if (nextCol) {
      queueMicrotask(() => beginEdit(row, nextCol))
      return
    }
    const rowIndex = filtered.findIndex((item) => item.id === row.id)
    const nextRow = filtered[rowIndex + (delta > 0 ? 1 : -1)]
    if (!nextRow) return
    const wrapCols = editableColumnsFor(nextRow)
    const wrapCol = delta > 0 ? wrapCols[0] : wrapCols.at(-1)
    if (wrapCol) queueMicrotask(() => beginEdit(nextRow, wrapCol))
  }

  const onNewRow = () => {
    if (!createDraftRow || !onDraftRowsChange) return
    rememberCreateOpener()
    if (pendingCreateId) {
      focusPendingCreateRow(pendingCreateId)
      const row = merged.find((item) => item.id === pendingCreateId)
      const first = row ? editableColumnsFor(row)[0] : undefined
      if (first && !editing) queueMicrotask(() => beginEdit(row!, first))
      return
    }
    const row = createDraftRow()
    onDraftRowsChange(keepRowOrder({ ...draftRows, [row.id]: row }))
    const first = editableColumnsFor(row)[0]
    queueMicrotask(() => {
      activateRow(row)
      if (first) beginEdit(row, first)
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
      if (!dirty) return
      event.preventDefault()
      void Promise.resolve(onReviewAndSave()).catch((reason: unknown) => {
        reportWriteError(reason)
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable, dirty, onReviewAndSave])

  useEffect(() => {
    if (!pendingCreateId || editing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const target = event.target
      if (!(target instanceof Element)) return
      if (!gridRef.current?.contains(target) && !target.closest('[data-testid="inline-create-actions"]')) return
      event.preventDefault()
      event.stopPropagation()
      cancelInlineCreate()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [pendingCreateId, editing, cancelInlineCreate])

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
    openMenu(row, event.clientX, event.clientY)
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
    if (event.key === 'Escape' && isPendingCreateRow(row.id, rows)) {
      event.preventDefault()
      cancelInlineCreate()
      return
    }
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
      beginEdit(row, column)
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
      const isEditing = editing?.rowId === row.id && editing.columnId === column.id
      const raw = column.read(row)
      const title = raw === null || raw === undefined ? '' : String(raw)
      const cellTestId = column.cellTestId?.(row)
      return (
        <div
          key={column.id}
          className={column.truncate ? 'standard-grid-cell truncate' : 'standard-grid-cell'}
          role="gridcell"
          data-column={column.id}
          style={column.width ? { width: column.width, flex: 'none', minWidth: column.width } : undefined}
          title={column.title?.(row) || (column.truncate ? title : undefined)}
          onDoubleClick={() => beginEdit(row, column)}
        >
          {isEditing ? (
            column.type === 'enum' && column.options ? (
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
                  patchRow(row.id, column.write(row, next))
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
              <input
                ref={(node) => {
                  inputRef.current = node
                }}
                data-testid={cellTestId ?? 'standard-cell-editor'}
                type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : column.type === 'datetime' ? 'datetime-local' : 'text'}
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
              />
            )
          ) : column.display === 'checkbox' ? (
            <input
              type="checkbox"
              data-testid={cellTestId}
              aria-label={column.header}
              checked={raw === true}
              disabled={!columnEditable(row, column)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onChange={(event) => {
                if (!column.write || !columnEditable(row, column)) return
                patchRow(row.id, column.write(row, event.target.checked ? 'true' : 'false'))
              }}
            />
          ) : column.display ? (
            <span data-testid={cellTestId}>{column.display(row)}</span>
          ) : column.type === 'boolean' ? (
            <span data-testid={cellTestId}>{raw === true ? copy.yes : '—'}</span>
          ) : (
            <span data-testid={cellTestId}>{title || '—'}</span>
          )}
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
      onNewRow={createDraftRow && onDraftRowsChange ? onNewRow : undefined}
      inlineCreateOpen={Boolean(pendingCreateId)}
      onCancelCreate={pendingCreateId ? cancelInlineCreate : undefined}
      onSaveCreate={pendingCreateId && onReviewAndSave ? onReview : undefined}
      onSelectFields={onSelectFields}
      selectFieldsLabel={selectFieldsLabel}
      rowCount={filtered.length}
      filterValue={filterValue}
      onFilterChange={onFilterChange}
      reviewVisible={editable && dirty}
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
              title={column.header}
              style={column.width ? { width: column.width, flex: 'none', minWidth: column.width } : undefined}
            >
              {column.header}
            </div>
          ))}
        </div>
        {filtered.length === 0 ? <p className="standard-grid-empty">{emptyLabel}</p> : null}
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
