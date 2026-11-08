// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StandardEditableTable, type StandardColumn } from './standard-editable-table'
import { copy } from './i18n'

afterEach(() => cleanup())

type Row = { id: string; name: string; kind: string }

const columns: Array<StandardColumn<Row>> = [
  {
    id: 'name',
    header: 'Name',
    editable: true,
    read: (row) => row.name,
    write: (row, value) => ({ ...row, name: value }),
  },
  {
    id: 'kind',
    header: 'Type',
    type: 'enum',
    editable: true,
    options: [
      { value: 'text', label: 'Text' },
      { value: 'value_list', label: 'Value list' },
    ],
    read: (row) => row.kind,
    write: (row, value) => ({ ...row, kind: value }),
    display: (row) => (row.kind === 'value_list' ? 'Value list' : row.kind === 'text' ? 'Text' : row.kind),
  },
]

describe('standard editable table', () => {
  it('calls onNewRow from the plus control', () => {
    const onNewRow = vi.fn()
    render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        onNewRow={onNewRow}
        editable
      />,
    )
    fireEvent.click(screen.getByTestId('table-add-row'))
    expect(onNewRow).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('standard-cell-editor')).toBeNull()
  })

  it('shows Review and save when drafts exist and runs the save handler', () => {
    const onReview = vi.fn()
    render(
      <StandardEditableTable
        columns={columns}
        rows={[]}
        draftRows={{ 'draft-1': { id: 'draft-1', name: 'New', kind: 'text' } }}
        onDraftRowsChange={() => undefined}
        onReviewAndSave={onReview}
        editable
      />,
    )
    expect(screen.getByTestId('review-and-save')).toBeTruthy()
    fireEvent.click(screen.getByTestId('review-and-save'))
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  it('edits a cell with Enter and commits on blur', () => {
    const onDraft = vi.fn()
    const { rerender } = render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        editable
      />,
    )
    const row = screen.getByTestId('standard-grid-row')
    fireEvent.keyDown(row, { key: 'Enter' })
    const editor = screen.getByTestId('standard-cell-editor') as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'Shade' } })
    fireEvent.blur(editor)
    expect(onDraft).toHaveBeenCalled()
    const patched = onDraft.mock.calls.at(-1)?.[0] as Record<string, Row>
    expect(patched['1'].name).toBe('Shade')

    rerender(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        draftRows={patched}
        onDraftRowsChange={onDraft}
        editable
      />,
    )
    expect(screen.getByText('Shade')).toBeTruthy()
  })

  it('shows readable type labels instead of codes', () => {
    render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        editable={false}
      />,
    )
    expect(screen.getByText('Value list')).toBeTruthy()
    expect(screen.queryByText('value_list')).toBeNull()
  })

  it('sets the full cell text as title even without truncate', () => {
    const longName = 'A very long attribute label that would be cut off in a narrow grid'
    render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: longName, kind: 'text' }]}
        editable={false}
      />,
    )
    const cell = screen.getByText(longName).closest('[data-column]')
    expect(cell?.getAttribute('title')).toBe(longName)
  })

  it('marks the active row with class on when activeRowId is set', () => {
    render(
      <StandardEditableTable
        columns={columns}
        rows={[
          { id: '1', name: 'Colour', kind: 'value_list' },
          { id: '2', name: 'Size', kind: 'text' },
        ]}
        activeRowId="2"
        editable={false}
      />,
    )
    const rows = screen.getAllByTestId('standard-grid-row')
    expect(rows[0].className).not.toContain(' on')
    expect(rows[0].classList.contains('on')).toBe(false)
    expect(rows[1].classList.contains('on')).toBe(true)
  })

  it('ArrowDown and ArrowUp activate the neighbour row when not editing', () => {
    const onActivate = vi.fn()
    const { rerender } = render(
      <StandardEditableTable
        columns={columns}
        rows={[
          { id: '1', name: 'Colour', kind: 'value_list' },
          { id: '2', name: 'Size', kind: 'text' },
          { id: '3', name: 'Weight', kind: 'text' },
        ]}
        activeRowId="1"
        onActivateRow={onActivate}
        editable={false}
      />,
    )
    const rows = screen.getAllByTestId('standard-grid-row')
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' })
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }))
    rerender(
      <StandardEditableTable
        columns={columns}
        rows={[
          { id: '1', name: 'Colour', kind: 'value_list' },
          { id: '2', name: 'Size', kind: 'text' },
          { id: '3', name: 'Weight', kind: 'text' },
        ]}
        activeRowId="2"
        onActivateRow={onActivate}
        editable={false}
      />,
    )
    const mid = screen.getAllByTestId('standard-grid-row')[1]
    fireEvent.keyDown(mid, { key: 'ArrowUp' })
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('click calls onActivateRow for selection', () => {
    const onActivate = vi.fn()
    render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        onActivateRow={onActivate}
        editable={false}
      />,
    )
    fireEvent.click(screen.getByTestId('standard-grid-row'))
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('keeps an internal active row when activeRowId is omitted', () => {
    render(
      <StandardEditableTable
        columns={columns}
        rows={[
          { id: '1', name: 'Colour', kind: 'value_list' },
          { id: '2', name: 'Size', kind: 'text' },
        ]}
        editable={false}
      />,
    )
    const rows = screen.getAllByTestId('standard-grid-row')
    fireEvent.click(rows[0])
    expect(rows[0].classList.contains('on')).toBe(true)
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' })
    const after = screen.getAllByTestId('standard-grid-row')
    expect(after[1].classList.contains('on')).toBe(true)
    expect(after[0].classList.contains('on')).toBe(false)
  })

})

type FeatureRow = {
  id: string
  name: string
  active: boolean
  fixed?: boolean
  readOnly?: boolean
}

const featureColumns: Array<StandardColumn<FeatureRow>> = [
  {
    id: 'name',
    header: 'Name',
    editable: true,
    read: (row) => row.name,
    write: (row, value) => ({ ...row, name: value }),
  },
  {
    id: 'active',
    header: 'Active',
    type: 'boolean',
    editable: true,
    display: 'checkbox',
    read: (row) => row.active,
    write: (row, value) => ({ ...row, active: value === 'true' }),
  },
]

const featureRows: FeatureRow[] = [
  { id: 'a', name: 'Alpha', active: true },
  { id: 'f', name: 'Fixed', active: false, fixed: true },
  { id: 'b', name: 'Beta', active: true },
  { id: 'c', name: 'Gamma', active: false },
]

describe('standard editable table opt-in abilities', () => {
  it('reorders with Alt+Arrow and stages the new order in draft rows', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={featureColumns}
        rows={[
          { id: 'a', name: 'Alpha', active: true },
          { id: 'b', name: 'Beta', active: true },
          { id: 'c', name: 'Gamma', active: false },
        ]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        getRowTestId={(row) => `row-${row.id}`}
        reorderable
      />,
    )
    fireEvent.keyDown(screen.getByTestId('row-b'), { key: 'ArrowUp', altKey: true })
    expect(onDraft).toHaveBeenCalledTimes(1)
    const next = onDraft.mock.calls[0][0] as Record<string, FeatureRow>
    expect(Object.keys(next)).toEqual(['b', 'a', 'c'])
    expect(next.b).toEqual({ id: 'b', name: 'Beta', active: true })
  })

  it('exposes Move row up, Move row down and Drag to reorder controls', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={featureColumns}
        rows={[
          { id: 'a', name: 'Alpha', active: true },
          { id: 'b', name: 'Beta', active: true },
        ]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        getRowTestId={(row) => `row-${row.id}`}
        reorderable
      />,
    )
    const first = screen.getByTestId('row-a')
    expect(within(first).getByLabelText('Move row up')).toBeTruthy()
    expect(within(first).getByLabelText('Drag to reorder')).toBeTruthy()
    fireEvent.click(within(first).getByLabelText('Move row down'))
    const next = onDraft.mock.calls[0][0] as Record<string, FeatureRow>
    expect(Object.keys(next)).toEqual(['b', 'a'])
  })

  it('keeps fixed rows at their index and refuses to move them', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={featureColumns}
        rows={featureRows}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        getRowTestId={(row) => `row-${row.id}`}
        rowFlags={(row) => ({ fixed: row.fixed, readOnly: row.readOnly })}
        reorderable
      />,
    )
    fireEvent.keyDown(screen.getByTestId('row-c'), { key: 'ArrowUp', altKey: true })
    const next = onDraft.mock.calls[0][0] as Record<string, FeatureRow>
    expect(Object.keys(next)).toEqual(['a', 'f', 'c', 'b'])
    expect(next.f).toEqual({ id: 'f', name: 'Fixed', active: false, fixed: true })

    onDraft.mockClear()
    fireEvent.keyDown(screen.getByTestId('row-f'), { key: 'ArrowDown', altKey: true })
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('shows the reordered draft order and the Review and save control', () => {
    const onDraft = vi.fn()
    const rows: FeatureRow[] = [
      { id: 'a', name: 'Alpha', active: true },
      { id: 'b', name: 'Beta', active: true },
      { id: 'c', name: 'Gamma', active: false },
    ]
    const { container, rerender } = render(
      <StandardEditableTable
        columns={featureColumns}
        rows={rows}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        onReviewAndSave={() => undefined}
        getRowTestId={(row) => `row-${row.id}`}
        reorderable
      />,
    )
    fireEvent.keyDown(screen.getByTestId('row-c'), { key: 'ArrowUp', altKey: true })
    const next = onDraft.mock.calls[0][0] as Record<string, FeatureRow>
    rerender(
      <StandardEditableTable
        columns={featureColumns}
        rows={rows}
        draftRows={next}
        onDraftRowsChange={onDraft}
        onReviewAndSave={() => undefined}
        getRowTestId={(row) => `row-${row.id}`}
        reorderable
      />,
    )
    const order = [...container.querySelectorAll('[data-row-id]')].map((el) => el.getAttribute('data-row-id'))
    expect(order).toEqual(['a', 'c', 'b'])
    expect(screen.getByTestId('review-and-save')).toBeTruthy()
  })

  it('stages a checkbox click outside edit mode', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={featureColumns}
        rows={[{ id: 'a', name: 'Alpha', active: true }]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        getRowTestId={(row) => `row-${row.id}`}
      />,
    )
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox.getAttribute('aria-checked')).toBe('true')
    expect(checkbox.classList.contains('check')).toBe(true)
    fireEvent.click(checkbox)
    expect(onDraft).toHaveBeenCalledTimes(1)
    const next = onDraft.mock.calls[0][0] as Record<string, FeatureRow>
    expect(next.a.active).toBe(false)
    expect(screen.queryByTestId('standard-cell-editor')).toBeNull()
  })

  it('Tab from an enum editor focuses the next checkbox and Shift+Tab returns to the editor', async () => {
    render(
      <StandardEditableTable
        columns={[
          {
            id: 'kind',
            header: 'Type',
            type: 'enum',
            editable: true,
            options: [
              { value: 'text', label: 'Text' },
              { value: 'number', label: 'Number' },
            ],
            read: (row: { id: string; kind: string; required: boolean }) => row.kind,
            write: (row, value) => ({ ...row, kind: value }),
          },
          {
            id: 'required',
            header: 'Required',
            type: 'boolean',
            editable: true,
            display: 'checkbox',
            read: (row: { id: string; kind: string; required: boolean }) => row.required,
            write: (row, value) => ({ ...row, required: value === 'true' }),
          },
        ]}
        rows={[{ id: 'a', kind: 'text', required: false }]}
        draftRows={{}}
        onDraftRowsChange={() => undefined}
      />,
    )
    fireEvent.doubleClick(document.querySelector('[data-row-id="a"] [data-column="kind"]')!)
    fireEvent.keyDown(screen.getByTestId('standard-cell-editor'), { key: 'Tab' })
    const required = screen.getByRole('checkbox', { name: 'Required' })
    await waitFor(() => expect(document.activeElement).toBe(required))
    fireEvent.keyDown(required, { key: 'Tab', shiftKey: true })
    await waitFor(() => {
      const editor = screen.getByTestId('standard-cell-editor')
      expect(editor.tagName).toBe('SELECT')
      expect(document.activeElement).toBe(editor)
    })
  })

  it('Tab skips a disabled checkbox and keeps focus on the next eligible one', async () => {
    type FlagRow = { id: string; unit: string; required: boolean; languages: boolean; searchable: boolean }
    const flagColumns: Array<StandardColumn<FlagRow>> = [
      {
        id: 'unit',
        header: 'Unit',
        editable: true,
        read: (row) => row.unit,
        write: (row, value) => ({ ...row, unit: value }),
      },
      {
        id: 'required',
        header: 'Required',
        type: 'boolean',
        editable: true,
        display: 'checkbox',
        read: (row) => row.required,
        write: (row, value) => ({ ...row, required: value === 'true' }),
      },
      {
        id: 'languages',
        header: 'Languages',
        type: 'boolean',
        editable: true,
        display: 'checkbox',
        read: (row) => row.languages,
        write: (row, value) => ({ ...row, languages: value === 'true' }),
      },
      {
        id: 'searchable',
        header: 'Searchable',
        type: 'boolean',
        editable: true,
        display: 'checkbox',
        read: (row) => row.searchable,
        write: (row, value) => ({ ...row, searchable: value === 'true' }),
      },
    ]
    render(
      <StandardEditableTable
        columns={flagColumns}
        rows={[{ id: 'n', unit: 'mass', required: true, languages: false, searchable: false }]}
        draftRows={{}}
        onDraftRowsChange={() => undefined}
        canEdit={(_row, column) => column.id !== 'languages'}
      />,
    )
    fireEvent.doubleClick(document.querySelector('[data-row-id="n"] [data-column="unit"]')!)
    fireEvent.keyDown(screen.getByTestId('standard-cell-editor'), { key: 'Tab' })
    const required = screen.getByRole('checkbox', { name: 'Required' })
    await waitFor(() => expect(document.activeElement).toBe(required))
    expect(screen.getByRole('checkbox', { name: 'Languages' })).toHaveProperty('disabled', true)
    fireEvent.keyDown(required, { key: 'Tab' })
    const searchable = screen.getByRole('checkbox', { name: 'Searchable' })
    await waitFor(() => expect(document.activeElement).toBe(searchable))
    expect(document.activeElement).not.toBe(screen.getByRole('checkbox', { name: 'Languages' }))
    fireEvent.keyDown(searchable, { key: 'Tab', shiftKey: true })
    await waitFor(() => expect(document.activeElement).toBe(required))
  })

  it('dims read-only rows and blocks edits, reordering and checkbox toggles', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={featureColumns}
        rows={[{ id: 'a', name: 'Alpha', active: true, readOnly: true }]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        getRowTestId={(row) => `row-${row.id}`}
        rowFlags={(row) => ({ fixed: row.fixed, readOnly: row.readOnly })}
        reorderable
      />,
    )
    const row = screen.getByTestId('row-a')
    expect(row.classList.contains('read-only')).toBe(true)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveProperty('disabled', true)
    expect((screen.getByLabelText('Drag to reorder') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Move row up') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(screen.queryByTestId('standard-cell-editor')).toBeNull()
    fireEvent.keyDown(row, { key: 'ArrowDown', altKey: true })
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('renders exactly as before when the new props are omitted', () => {
    render(
      <StandardEditableTable
        columns={columns}
        rows={[
          { id: '1', name: 'Colour', kind: 'value_list' },
          { id: '2', name: 'Size', kind: 'text' },
        ]}
        editable={false}
      />,
    )
    expect(screen.queryByLabelText('Drag to reorder')).toBeNull()
    expect(screen.queryByLabelText('Move row up')).toBeNull()
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length)
    expect(screen.getAllByTestId('standard-grid-row')[0].className).toBe('standard-grid-row')
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})


describe('value list master detail helpers', () => {
  it('exposes list values as a separate row set for the detail pane', async () => {
    const { valueListOptions } = await import('./model-tables')
    const defs = {
      value_lists: [
        {
          key: 'colour',
          labels: { en: 'Colour' },
          options: [
            { code: 'red', labels: { en: 'Red' } },
            { code: 'blue', labels: { en: 'Blue' } },
          ],
        },
      ],
    }
    const rows = valueListOptions(defs, 'colour')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.code).toBe('red')
    expect(rows[0]?.label).toBe('Red')
  })
})

describe('standard editable table loading state', () => {
  it('keeps the toolbar and shows loading before the first response, then the empty text', () => {
    const { rerender } = render(
      <StandardEditableTable
        columns={columns}
        rows={[]}
        editable={false}
        loading
        emptyLabel="No saved mappings yet."
      />,
    )
    expect(screen.getByTestId('standard-table-bar')).toBeTruthy()
    expect(screen.getByTestId('standard-grid-loading')).toBeTruthy()
    expect(screen.queryByText('No saved mappings yet.')).toBeNull()

    rerender(
      <StandardEditableTable
        columns={columns}
        rows={[]}
        editable={false}
        loading={false}
        emptyLabel="No saved mappings yet."
      />,
    )
    expect(screen.getByTestId('standard-table-bar')).toBeTruthy()
    expect(screen.queryByTestId('standard-grid-loading')).toBeNull()
    expect(screen.getByTestId('standard-grid-empty')).toBeTruthy()
    expect(screen.getByText('No saved mappings yet.')).toBeTruthy()
  })
})

describe('semantic no-op drafts', () => {
  it('does not stage a draft when a text edit confirms the same value', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        editable
      />,
    )
    const row = screen.getByTestId('standard-grid-row')
    fireEvent.keyDown(row, { key: 'Enter' })
    const editor = screen.getByTestId('standard-cell-editor') as HTMLInputElement
    fireEvent.blur(editor)
    expect(onDraft).not.toHaveBeenCalled()
  })

  it('removes a draft when the edit is reverted to the base value', () => {
    const onDraft = vi.fn()
    render(
      <StandardEditableTable
        columns={columns}
        rows={[{ id: '1', name: 'Colour', kind: 'value_list' }]}
        draftRows={{ '1': { id: '1', name: 'Shade', kind: 'value_list' } }}
        onDraftRowsChange={onDraft}
        editable
      />,
    )
    const row = screen.getByTestId('standard-grid-row')
    fireEvent.keyDown(row, { key: 'Enter' })
    const editor = screen.getByTestId('standard-cell-editor') as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'Colour' } })
    fireEvent.blur(editor)
    expect(onDraft).toHaveBeenCalled()
    expect(onDraft.mock.calls.at(-1)?.[0]).toEqual({})
  })

  it('removes a checkbox draft when it toggles back to the base value', () => {
    type BoolRow = { id: string; active: boolean }
    const boolColumns: Array<StandardColumn<BoolRow>> = [{
      id: 'active',
      header: 'Active',
      type: 'boolean',
      display: 'checkbox',
      cellTestId: () => 'active-checkbox',
      read: (row) => row.active,
      write: (row, value) => ({ ...row, active: value === 'true' }),
    }]
    const onDraft = vi.fn()
    const base = { id: '1', active: false }
    const { rerender } = render(
      <StandardEditableTable
        columns={boolColumns}
        rows={[base]}
        draftRows={{}}
        onDraftRowsChange={onDraft}
        editable
      />,
    )
    fireEvent.click(screen.getByTestId('active-checkbox'))
    const first = onDraft.mock.calls.at(-1)?.[0] as Record<string, BoolRow>
    expect(first['1']?.active).toBe(true)
    rerender(
      <StandardEditableTable
        columns={boolColumns}
        rows={[base]}
        draftRows={first}
        onDraftRowsChange={onDraft}
        editable
      />,
    )
    fireEvent.click(screen.getByTestId('active-checkbox'))
    expect(onDraft.mock.calls.at(-1)?.[0]).toEqual({})
  })
})
