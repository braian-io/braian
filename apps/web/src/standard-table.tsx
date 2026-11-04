import type { ReactNode } from 'react'
import { Columns3, Plus, Search } from 'lucide-react'
import { copy } from './i18n'
import { formatCount } from './format'
import { Kbd } from './components/ui/kbd'

export type StandardTableChromeProps = {
  /** Accessible name for the plus control that creates a new row. */
  newRowLabel?: string
  onNewRow?: () => void
  /** Opens the field picker for this table. */
  onSelectFields?: () => void
  selectFieldsLabel?: string
  rowCount?: number
  /** Generic text filter shared by every table that opts in. */
  filterValue?: string
  onFilterChange?: (value: string) => void
  filterPlaceholder?: string
  /** When true, show Review and save (same action as Ctrl+S). */
  reviewVisible?: boolean
  onReview?: () => void
  /** Inline create row open: Cancel and Save stay in this slot (text labels). */
  inlineCreateOpen?: boolean
  onCancelCreate?: () => void
  onSaveCreate?: () => void
  children: ReactNode
  testId?: string
}

/**
 * Shared chrome for every app table: optional filter, plus creates a row,
 * optional Review and save, row count. View placement stays on Ctrl+K.
 */
export function StandardTableChrome({
  newRowLabel,
  onNewRow,
  onSelectFields,
  selectFieldsLabel,
  rowCount,
  filterValue,
  onFilterChange,
  filterPlaceholder = copy.search,
  reviewVisible = false,
  onReview,
  inlineCreateOpen = false,
  onCancelCreate,
  onSaveCreate,
  children,
  testId = 'standard-table',
}: StandardTableChromeProps) {
  return (
    <div className="table-wrap" data-testid={testId}>
      <div className="toolbar standard-table-bar" data-testid="standard-table-bar">
        {onFilterChange ? (
          <label className="search-field">
            <Search size={14} aria-hidden="true" />
            <input
              data-testid="quick-filter"
              placeholder={filterPlaceholder}
              value={filterValue ?? ''}
              onChange={(event) => onFilterChange(event.target.value)}
            />
            <Kbd>/</Kbd>
          </label>
        ) : null}
        {onNewRow ? (
          <button
            type="button"
            className="icon-btn"
            data-testid="table-add-row"
            aria-label={newRowLabel ?? copy.newRow}
            onClick={onNewRow}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        ) : null}
        <span className="standard-table-create-actions" data-testid="inline-create-actions">
          {inlineCreateOpen && onCancelCreate ? (
            <>
              <button type="button" data-testid="inline-create-cancel" onClick={onCancelCreate}>
                {copy.cancel}
              </button>
              {onSaveCreate ? (
                <button type="button" className="primary" data-testid="inline-create-save" onClick={onSaveCreate}>
                  {copy.save}
                </button>
              ) : null}
            </>
          ) : null}
        </span>
        {onSelectFields ? (
          <button
            type="button"
            className="icon-btn"
            data-testid="table-select-fields"
            aria-label={selectFieldsLabel ?? copy.selectFields}
            onClick={onSelectFields}
          >
            <Columns3 size={14} aria-hidden="true" />
          </button>
        ) : null}
        {reviewVisible && onReview ? (
          <button type="button" className="primary" data-testid="review-and-save" onClick={onReview}>
            {copy.reviewAndSave}
          </button>
        ) : null}
        {typeof rowCount === 'number' ? (
          <span className="row-count" data-testid="row-count">
            {formatCount(rowCount)} {copy.rows}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  )
}
