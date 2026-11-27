// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect, useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectDetail, ObjectTable, type PanesSession } from './panes'
import { SharedContextMenuHost } from './shared-context-menu'
import { OPEN_DELETE_OBJECTS } from './delete-objects'
import { publishMarked, publishTreeNode, readSelection, resetUiContext } from './ui-context'

const { scrollToIndex } = vi.hoisted(() => ({ scrollToIndex: vi.fn() }))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * 28,
        size: 28,
        end: (index + 1) * 28,
        key: index,
        lane: 0,
      })),
    getTotalSize: () => options.count * 28,
    scrollToIndex,
  }),
}))

const tableRows = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five']

/** When set, page 1 returns only the named rows and later pages return the rest. */
let pageSize = 100

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function documents() {
  const rows = [
    ...tableRows.map((name, index) => ({ id: `id-${index}`, key: `ART-${index}`, name })),
    { id: 'id-6', key: 'ART-6', name: 'Six' },
    { id: 'id-7', key: 'ART-7', name: 'Seven' },
  ]
  return pageSize >= rows.length ? rows.slice(0, tableRows.length) : rows
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function Harness({
  viewState = {},
  detail = false,
}: {
  viewState?: Record<string, unknown>
  detail?: boolean
}) {
  const [queryClient] = useState(client)
  const [objectId, setObjectId] = useState<string | null>(null)
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId,
      proposalId: null,
      language: 'en',
      setGroup: () => undefined,
      setObjectId,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [objectId],
  )
  useEffect(() => {
    const onCommand = (event: Event) => {
      const detailEvent = (event as CustomEvent<{ id: string }>).detail
      if (!detailEvent?.id?.startsWith('columns:show:')) return
    }
    window.addEventListener('braian:command', onCommand)
    return () => window.removeEventListener('braian:command', onCommand)
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <SharedContextMenuHost />
      <ObjectTable
        session={session}
        view={{ id: 'table', type: 'object_table', title: 'Objects', state: viewState }}
        workspace={{ id: 'ws', views: [{ id: 'tree', type: 'structure_tree', title: 'Food', state: {} }] }}
      />
      {detail ? <ObjectDetail session={session} /> : <div data-testid="detail">{objectId ?? ''}</div>}
    </QueryClientProvider>
  )
}

function grid() {
  const node = document.querySelector('.grid')
  if (!(node instanceof HTMLElement)) throw new Error('missing grid')
  return node
}

function rows() {
  return screen.getAllByTestId('object-row')
}

function selectedIds() {
  return rows().filter((row) => row.getAttribute('aria-selected') === 'true').map((row) => row.getAttribute('id'))
}

beforeEach(() => {
  pageSize = 100
  resetUiContext()
  scrollToIndex.mockClear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Element.prototype.scrollIntoView = () => undefined
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v1/search')) {
        const parsed = new URL(url, 'http://local')
        const page = Number(parsed.searchParams.get('page') ?? '1')
        const q = (parsed.searchParams.get('q') ?? '').toLowerCase()
        const all = documents().filter((row) => !q || `${row.name} ${row.key}`.toLowerCase().includes(q))
        const start = (page - 1) * pageSize
        const slice = all.slice(start, start + pageSize)
        return json({
          found: all.length,
          hits: slice.map((row) => ({
            document: {
              id: row.id,
              key: row.key,
              type_key: 'article',
              version: '1',
              a_name__en: row.name,
              a_status: 'ok',
            },
          })),
        })
      }
      if (url.includes('/v1/objects/')) {
        const id = decodeURIComponent(url.split('/v1/objects/')[1]?.split('?')[0] ?? 'id-0')
        const index = Number(id.replace('id-', ''))
        const name = tableRows[index] ?? `Row ${index}`
        return json({
          id,
          key: `ART-${index}`,
          type: 'article',
          version: 1,
          values: { number: `ART-${index}`, name: { en: name } },
          links: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        })
      }
      if (url.includes('/v1/definitions')) {
        return json({
          languages: ['en'],
          types: [{ key: 'article', attributes: [] }],
          attributes: [],
          value_lists: [],
          unit_families: [],
          structures: [
            {
              key: 'food',
              groups: [
                { id: '1', key: 'cheese' },
                { id: '2', key: 'milk' },
              ],
            },
          ],
        })
      }
      if (url.includes('/v1/assortments')) return json({ assortments: [] })
      if (url.includes('/v1/proposals')) return json({ proposals: [] })
      if (url.includes('/v1/me')) return json({ user_id: 'u', role: 'admin', kind: 'human' })
      return json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('table row selection', () => {
  it('replaces the selection on click and extends anchor..clicked on Shift+click', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(rows()[1]!)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-1'))
    fireEvent.click(rows()[3]!, { shiftKey: true })

    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-1', 'object-row-id-2', 'object-row-id-3']))
    expect(screen.getByTestId('detail').textContent).toBe('id-3')
    expect(screen.getByTestId('table-selection-count').textContent).toBe('3 selected')

    fireEvent.click(rows()[4]!)
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-4']))
    expect(screen.queryByTestId('table-selection-bar')).toBeNull()
  })

  it('toggles with Ctrl+click and extends Shift+Arrow from the click anchor', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(rows()[1]!)
    fireEvent.click(rows()[3]!, { ctrlKey: true })
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-1', 'object-row-id-3']))

    fireEvent.click(rows()[3]!, { metaKey: true })
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-1']))

    fireEvent.click(rows()[1]!)
    fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: true })
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-1', 'object-row-id-2', 'object-row-id-3']))
  })

  it('toggles a checkbox without replacing the rest and shift-clicks a range', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    expect(grid().getAttribute('data-has-selection')).toBe('false')

    fireEvent.click(rows()[0]!)
    await waitFor(() => expect(grid().getAttribute('data-has-selection')).toBe('true'))
    const boxes = () => screen.getAllByTestId('row-checkbox')
    expect((boxes()[0] as HTMLInputElement).checked).toBe(true)

    fireEvent.click(boxes()[2]!)
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-0', 'object-row-id-2']))
    expect(screen.getByTestId('detail').textContent).toBe('id-0')

    fireEvent.click(boxes()[4]!, { shiftKey: true })
    await waitFor(() => expect(selectedIds()).toEqual([
      'object-row-id-0',
      'object-row-id-1',
      'object-row-id-2',
      'object-row-id-3',
      'object-row-id-4',
    ]))
  })

  it('shows the action bar only for more than one row, deletes that selection, and clears it', async () => {
    publishMarked('id-2', 'article')
    render(<Harness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    const deleted: string[][] = []
    const onDelete = (event: Event) => {
      deleted.push([...(event as CustomEvent<{ ids: string[] }>).detail.ids])
    }
    window.addEventListener(OPEN_DELETE_OBJECTS, onDelete)

    fireEvent.click(rows()[0]!)
    expect(screen.queryByTestId('table-selection-bar')).toBeNull()
    fireEvent.click(rows()[2]!, { shiftKey: true })
    const bar = await screen.findByTestId('table-selection-bar')
    expect(within(bar).getByTestId('table-selection-count').textContent).toBe('3 selected')

    fireEvent.click(within(bar).getByTestId('table-selection-delete'))
    expect(deleted).toEqual([['id-0', 'id-1', 'id-2']])

    fireEvent.click(within(bar).getByTestId('table-selection-clear'))
    await waitFor(() => expect(screen.queryByTestId('table-selection-bar')).toBeNull())
    expect(selectedIds()).toEqual([])
    expect(screen.getByTestId('detail').textContent).toBe('id-2')

    fireEvent.click(rows()[0]!)
    fireEvent.click(rows()[1]!, { shiftKey: true })
    await screen.findByTestId('table-selection-bar')
    fireEvent.click(rows()[4]!)
    await waitFor(() => expect(screen.queryByTestId('table-selection-bar')).toBeNull())
    expect(selectedIds()).toEqual(['object-row-id-4'])

    window.removeEventListener(OPEN_DELETE_OBJECTS, onDelete)
  })

  it('keeps a context-menu selection and deletes every selected id', async () => {
    render(<Harness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    const commands: Array<{ id: string; ids: string[] }> = []
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; target?: { objects?: Array<{ id?: string }> } }>).detail
      commands.push({
        id: detail.id,
        ids: (detail.target?.objects ?? []).map((item) => String(item.id ?? '')),
      })
    }
    window.addEventListener('braian:command', onCommand)

    fireEvent.click(rows()[0]!)
    fireEvent.click(rows()[2]!, { shiftKey: true })
    await screen.findByTestId('table-selection-bar')
    fireEvent.contextMenu(rows()[1]!)
    expect(selectedIds()).toEqual(['object-row-id-0', 'object-row-id-1', 'object-row-id-2'])
    fireEvent.click(within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Delete…' }))
    expect(commands.some((command) => command.id === 'object:delete' && command.ids.join(',') === 'id-0,id-1,id-2')).toBe(true)

    fireEvent.contextMenu(rows()[4]!)
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-4']))

    window.removeEventListener('braian:command', onCommand)
  })

  it('selects loaded rows with Ctrl+A, then every match from the banner and Select all', async () => {
    pageSize = tableRows.length
    render(<Harness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    expect(screen.getByTestId('row-count').textContent).toContain('8')

    fireEvent.keyDown(grid(), { key: 'a', ctrlKey: true })
    const banner = await screen.findByTestId('select-all-matching')
    expect(banner.textContent).toBe('Select all 8 matching')
    expect(selectedIds()).toEqual(tableRows.map((_, index) => `object-row-id-${index}`))
    expect(screen.getByTestId('table-selection-count').textContent).toBe('6 selected')

    fireEvent.click(banner)
    await waitFor(() => expect(screen.queryByTestId('select-all-matching')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('table-selection-count').textContent).toBe('8 selected'))
    expect(readSelection('table').map((row) => row.id)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4', 'id-5', 'id-6', 'id-7'])

    fireEvent.click(rows()[0]!)
    await waitFor(() => expect(selectedIds()).toEqual(['object-row-id-0']))
    fireEvent.contextMenu(rows()[0]!)
    fireEvent.click(within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Select all' }))
    await waitFor(() => expect(screen.getByTestId('table-selection-count').textContent).toBe('8 selected'))
  })

  it('clears the selection when the search changes and when the tree node changes', async () => {
    render(<Harness viewState={{ source: { kind: 'peer', viewId: 'tree', selection: 'node' } }} />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(rows()[0]!)
    fireEvent.click(rows()[1]!, { shiftKey: true })
    await screen.findByTestId('table-selection-bar')

    fireEvent.change(screen.getByTestId('quick-filter'), { target: { value: 'Two' } })
    await waitFor(() => expect(screen.queryByTestId('table-selection-bar')).toBeNull())
    expect(rows().every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true)

    fireEvent.change(screen.getByTestId('quick-filter'), { target: { value: '' } })
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    fireEvent.click(rows()[0]!)
    fireEvent.click(rows()[1]!, { shiftKey: true })
    await screen.findByTestId('table-selection-bar')

    publishTreeNode('tree', { structureId: 'food', structureKey: 'food', groupKey: 'cheese' })
    await waitFor(() => expect(screen.queryByTestId('table-selection-bar')).toBeNull())
    expect(readSelection('table')).toEqual([])
  })

  it('shows a small selected count in Detail while keeping the active row', async () => {
    render(<Harness detail />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(rows()[1]!)
    await waitFor(() => expect(screen.getByTestId('object-detail')).toBeTruthy())
    expect(screen.queryByTestId('detail-selection-hint')).toBeNull()

    fireEvent.click(rows()[3]!, { shiftKey: true })
    const hint = await screen.findByTestId('detail-selection-hint')
    expect(hint.textContent).toBe('3 selected')
    expect(hint.className).toContain('detail-selection-hint')
    expect(screen.getByTestId('object-detail').querySelector('.detail-title strong')?.textContent).toBe('Three')
  })
})
