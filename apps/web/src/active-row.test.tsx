// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect, useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { CommandPalette } from './palette'
import { ObjectTable, type PanesSession } from './panes'
import { StructureTree } from './shell'
import { dispatchUi, onUi } from './ui-bus'
import { registerCommandRunner } from './command-registry'
import { SharedContextMenuHost } from './shared-context-menu'
import { publishColumns, readUiContext, resetUiContext } from './ui-context'
import { copy } from './i18n'

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

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function TableHarness() {
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
    const stops = [
      registerCommandRunner('columns:hide', (target) => {
        if (target.column) dispatchUi('ui.hide_column', { column: String(target.column) })
      }),
      registerCommandRunner('object:open', (target) => {
        if (target.objectId) setObjectId(String(target.objectId))
      }),
      registerCommandRunner('table:mass-edit', () => undefined),
      registerCommandRunner('table:filter-by', () => undefined),
      registerCommandRunner('table:export', () => undefined),
      registerCommandRunner('table:export-columns', () => undefined),
      registerCommandRunner('table:select', () => undefined),
      registerCommandRunner('object:right', () => undefined),
      registerCommandRunner('object:history', () => undefined),
      registerCommandRunner('object:move-group', () => undefined),
      registerCommandRunner('palette:search', () => undefined),
    ]
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail
      if (!detail?.id?.startsWith('columns:show:')) return
      dispatchUi('ui.show_column', { column: detail.id.slice('columns:show:'.length) })
    }
    window.addEventListener('braian:command', onCommand)
    return () => {
      stops.forEach((stop) => stop())
      window.removeEventListener('braian:command', onCommand)
    }
  }, [])
  return (
    <QueryClientProvider client={queryClient}>
      <SharedContextMenuHost />
      <ObjectTable
        session={session}
        view={{ id: 'table', type: 'object_table', title: 'Objects', state: {} }}
        workspace={{ id: 'ws' }}
      />
      <div data-testid="detail">{objectId ?? ''}</div>
    </QueryClientProvider>
  )
}

function TreeHarness() {
  const [queryClient] = useState(client)
  const [group, setGroup] = useState<string | null>(null)
  const session = useMemo(
    () => ({
      group,
      objectId: null,
      proposalId: null,
      language: 'en',
      activity: [],
      setGroup,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      listType: null,
      setListType: () => undefined,
      push: () => undefined,
      openWorkspace: () => undefined,
      openTypeView: () => undefined,
    }),
    [group],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <StructureTree session={session} view={{ id: 'tree', type: 'structure_tree', title: 'Assortment', state: {} }} />
      <div data-testid="detail">{group ?? ''}</div>
    </QueryClientProvider>
  )
}

function PaletteHarness() {
  const [queryClient] = useState(client)
  const [objectId, setObjectId] = useState<string | null>('obj-9')
  const session = useMemo(
    () => ({
      objectId,
      setObjectId,
      setProposalId: () => undefined,
      push: () => undefined,
      openWorkspace: () => undefined,
    }),
    [objectId],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <CommandPalette session={session} workspaces={[]} views={[]} onClose={() => undefined} />
      <div data-testid="detail">{objectId ?? ''}</div>
    </QueryClientProvider>
  )
}

beforeEach(() => {
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
        if (url.includes('group=groups')) return json({ groups: [] })
        return json({
          found: tableRows.length,
          hits: tableRows.map((name, index) => ({
            document: {
              id: `id-${index}`,
              key: `ART-${index}`,
              type_key: 'article',
              version: '1',
              a_name__en: name,
              a_status: 'ok',
            },
          })),
        })
      }
      if (url.includes('/v1/definitions')) {
        return json({
          types: [],
          attributes: [],
          unit_families: [],
          structures: [
            {
              key: 'assortment',
              groups: [
                { id: '1', key: 'alpha' },
                { id: '2', key: 'beta', parent: '1' },
                { id: '3', key: 'gamma' },
                { id: '4', key: 'delta' },
              ],
            },
          ],
        })
      }
      if (url.includes('/v1/assortments')) return json({ assortments: [] })
      if (url.includes('/v1/frecency')) return json({ entries: {} })
      return json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function grid() {
  const node = document.querySelector('.grid')
  if (!(node instanceof HTMLElement)) throw new Error('missing grid')
  return node
}

function stylesPath() {
  const candidates = [join(process.cwd(), 'src/styles.css'), join(process.cwd(), 'apps/web/src/styles.css')]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error(`styles.css not found from ${process.cwd()}`)
  return found
}

function installRowStyles() {
  const source = readFileSync(stylesPath(), 'utf8')
  const start = source.indexOf('.row.selected')
  const end = source.indexOf('.draft-user')
  if (start < 0 || end < start) throw new Error('row selection styles missing')
  const rules = source.slice(start, end)
  // One rule carries fill and rules. Hover is a neutral surface, not that fill.
  expect(rules).toMatch(/\.row\.selected\s*\{[^}]*background:\s*var\(--accent-dim\)[^}]*box-shadow:\s*inset 0 1px 0 var\(--accent\), inset 0 -1px 0 var\(--accent\)/)
  expect(rules).toMatch(/\.row:hover:not\(\.selected\)\s*\{[^}]*background:\s*var\(--hover\)/)
  expect(rules).not.toMatch(/\.row:hover[^{]*\{[^}]*accent/)
  const style = document.createElement('style')
  style.textContent = rules
  document.head.appendChild(style)
}

function selectedLook(row: Element) {
  const style = getComputedStyle(row)
  // jsdom keeps these specified values when the color is a custom property.
  return style.boxShadow.includes('inset 0 1px 0') && style.boxShadow.includes('inset 0 -1px 0')
}

describe('active row', () => {
  it('continues arrows from the clicked table row and ignores hover', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    const rows = () => screen.getAllByTestId('object-row')

    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-1'))
    expect(rows()[1]?.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(rows()[3]!)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-3'))
    expect(grid().getAttribute('aria-activedescendant')).toBe('object-row-id-3')

    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-4'))
    expect(rows()[4]?.getAttribute('aria-selected')).toBe('true')
    expect(rows()[1]?.getAttribute('aria-selected')).toBe('false')
    expect(rows()[2]?.getAttribute('aria-selected')).toBe('false')

    fireEvent.mouseEnter(rows()[0]!)
    fireEvent.mouseOver(rows()[0]!)
    fireEvent.pointerMove(rows()[0]!)
    expect(screen.getByTestId('detail').textContent).toBe('id-4')
    expect(rows()[0]?.getAttribute('aria-selected')).toBe('false')
    expect(scrollToIndex).toHaveBeenLastCalledWith(4)
    expect(readUiContext().selection).toEqual([{ id: 'id-4', key: 'ART-4', name: 'Four', type: 'article', version: '1' }])
  })

  it('keeps one selected style after a click and three ArrowDowns', async () => {
    installRowStyles()
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    const rows = () => screen.getAllByTestId('object-row')
    const selected = () => rows().filter((row) => row.classList.contains('selected'))

    fireEvent.mouseDown(rows()[0]!)
    fireEvent.click(rows()[0]!)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-0'))
    expect(document.activeElement).toBe(grid())
    expect(rows()[0]?.getAttribute('tabindex')).toBeNull()
    expect(selected()).toEqual([rows()[0]])

    const focused = document.activeElement
    if (!(focused instanceof HTMLElement)) throw new Error('grid lost focus')
    fireEvent.keyDown(focused, { key: 'ArrowDown' })
    fireEvent.keyDown(focused, { key: 'ArrowDown' })
    fireEvent.keyDown(focused, { key: 'ArrowDown' })

    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-3'))
    expect(selected()).toHaveLength(1)
    expect(selected()[0]).toBe(rows()[3])
    expect(rows().filter((row) => selectedLook(row))).toEqual([rows()[3]])
    expect(rows()[0]?.classList.contains('selected')).toBe(false)
    expect(rows().filter((row) => row.getAttribute('aria-selected') === 'true')).toEqual([rows()[3]])
    expect(document.activeElement).toBe(grid())
    expect(rows().every((row) => row !== document.activeElement)).toBe(true)
    expect(grid().getAttribute('aria-activedescendant')).toBe('object-row-id-3')

    fireEvent.mouseEnter(rows()[5]!)
    fireEvent.mouseOver(rows()[5]!)
    fireEvent.pointerMove(rows()[5]!)
    expect(selected()).toEqual([rows()[3]])
    expect(rows()[5]?.classList.contains('selected')).toBe(false)
    expect(rows()[5]?.classList.contains('picked')).toBe(false)
    expect(screen.getByTestId('detail').textContent).toBe('id-3')
  })

  it('moves the tree selection with the same active row arrows start from', async () => {
    render(<TreeHarness />)
    await waitFor(() => expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0))
    const tree = screen.getByTestId('structure-tree')
    const item = (name: string) => screen.getByRole('treeitem', { name })

    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(screen.getByTestId('detail').textContent).toBe('assortment:alpha')
    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(screen.getByTestId('detail').textContent).toBe('assortment:gamma')

    fireEvent.click(item('alpha'))
    expect(screen.getByTestId('detail').textContent).toBe('assortment:alpha')
    expect(item('alpha').getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(tree, { key: 'ArrowDown' })
    expect(screen.getByTestId('detail').textContent).toBe('assortment:gamma')
    expect(item('delta').getAttribute('aria-selected')).toBe('false')

    fireEvent.mouseEnter(item('delta'))
    fireEvent.pointerMove(item('delta'))
    expect(screen.getByTestId('detail').textContent).toBe('assortment:gamma')
    expect(tree.getAttribute('aria-activedescendant')).toBe('tree-row-assortment-gamma')
  })

  it('does not move the palette row when the pointer hovers', async () => {
    render(<PaletteHarness />)
    const input = await screen.findByTestId('palette-input')
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3))

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const before = screen.getByTestId('palette-active').textContent
    expect(before && before.length > 0).toBe(true)

    fireEvent.mouseEnter(screen.getAllByRole('option')[0]!)
    fireEvent.pointerMove(screen.getAllByRole('option')[0]!)
    expect(screen.getByTestId('palette-active').textContent).toBe(before)

    fireEvent.pointerDown(screen.getByRole('option', { name: /Move view left/ }))
    expect(screen.getByTestId('palette-active').textContent).toBe('Move the focused view left')
    expect(screen.queryByRole('option', { name: 'Open to the right' })).toBeNull()
    expect(screen.queryByRole('option', { name: /Move to group/ })).toBeNull()
  })
})

describe('hide column', () => {
  const headers = () => Array.from(document.querySelectorAll('.head [data-testid^="col-"]')).map((node) => node.getAttribute('data-testid'))

  async function hideFromCell(text: string) {
    fireEvent.contextMenu(screen.getByText(text))
    const menu = await screen.findByTestId('context-menu')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide column' }))
  }

  it('hides the column that was right-clicked', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    expect(headers()).toEqual(['col-key', 'col-name', 'col-type', 'col-status', 'col-version'])

    await hideFromCell('Two')

    await waitFor(() => expect(headers()).toEqual(['col-key', 'col-type', 'col-status', 'col-version']))
  })

  it('hides the column from a right-clicked header', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.contextMenu(screen.getByTestId('col-name'))
    const menu = await screen.findByTestId('context-menu')
    expect(menu.getAttribute('aria-label')).toBe('Name')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide column' }))

    await waitFor(() => expect(headers()).toEqual(['col-key', 'col-type', 'col-status', 'col-version']))
  })

  it('hides the right-clicked header column after the columns were moved', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    act(() => {
      dispatchUi('ui.move_column', { from: 'version', to: 'key' })
    })
    await waitFor(() => expect(headers()).toEqual(['col-version', 'col-key', 'col-name', 'col-type', 'col-status']))

    fireEvent.contextMenu(screen.getByTestId('col-name'))
    const menu = await screen.findByTestId('context-menu')
    expect(menu.getAttribute('aria-label')).toBe('Name')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Hide column' }))

    await waitFor(() => expect(headers()).toEqual(['col-version', 'col-key', 'col-type', 'col-status']))
  })

  it('hides the right-clicked column after the columns were moved', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))
    act(() => {
      dispatchUi('ui.move_column', { from: 'version', to: 'key' })
    })
    await waitFor(() => expect(headers()).toEqual(['col-version', 'col-key', 'col-name', 'col-type', 'col-status']))

    await hideFromCell('ART-3')

    await waitFor(() => expect(headers()).toEqual(['col-version', 'col-name', 'col-type', 'col-status']))
  })

  it('offers no hide action when no column cell was right-clicked', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.contextMenu(screen.getAllByTestId('object-row')[1]!)
    const menu = await screen.findByTestId('context-menu')

    expect(within(menu).queryByRole('menuitem', { name: 'Hide column' })).toBeNull()
    expect(headers()).toEqual(['col-key', 'col-name', 'col-type', 'col-status', 'col-version'])
  })
})

const allColumns = ['col-key', 'col-name', 'col-type', 'col-status', 'col-version']

function headerIds() {
  return Array.from(document.querySelectorAll('.head [data-testid^="col-"]')).map((node) => node.getAttribute('data-testid'))
}

describe('show column', () => {
  it('keeps Select fields out of the cell menu', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.contextMenu(screen.getByText('Two'))
    fireEvent.click(within(await screen.findByTestId('context-menu')).getByRole('menuitem', { name: 'Hide column' }))
    await waitFor(() => expect(headerIds()).toEqual(['col-key', 'col-type', 'col-status', 'col-version']))

    fireEvent.contextMenu(screen.getByText('ART-1'))
    const menu = await screen.findByTestId('context-menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Show Name' })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: 'Select fields…' })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: 'Hide column' })).toBeTruthy()
  })

  it('hides and shows through ui.hide_column and ui.show_column, and publishes the columns', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    act(() => {
      dispatchUi('ui.hide_column', { column: 'type' })
    })
    await waitFor(() => expect(headerIds()).toEqual(['col-key', 'col-name', 'col-status', 'col-version']))
    await waitFor(() => expect(readUiContext().columns.find((column) => column.id === 'type')?.hidden).toBe(true))

    act(() => {
      dispatchUi('ui.show_column', { column: 'type' })
    })
    // Re-shown columns append last (same rule as Fields toggleField).
    await waitFor(() => expect(headerIds()).toEqual(['col-key', 'col-name', 'col-status', 'col-version', 'col-type']))
    await waitFor(() => expect(readUiContext().columns.every((column) => !column.hidden)).toBe(true))
    expect(readUiContext().columns.map((column) => column.header)).toEqual(['Number', 'Name', 'Status', 'Version', 'Type'])
  })
})

describe('keyboard context menu', () => {
  const focusedText = () => (document.activeElement as HTMLElement | null)?.textContent ?? ''

  it('opens with Shift+F10 on the active cell, moves with arrows and closes with Esc', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(screen.getByText('Two'))
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-2'))
    fireEvent.keyDown(grid(), { key: 'ArrowRight' })
    expect(document.querySelector('.row.selected .active-cell')?.getAttribute('data-column')).toBe('type')

    fireEvent.keyDown(grid(), { key: 'F10', shiftKey: true })
    const menu = await screen.findByTestId('context-menu')
    expect(menu.getAttribute('role')).toBe('menu')
    expect(menu.getAttribute('aria-label')).toBe('Type')
    await waitFor(() => expect(focusedText()).toBe('Open Enter'))

    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(focusedText()).toBe('Open to the right')
    fireEvent.keyDown(document.activeElement!, { key: 'End' })
    const last = focusedText()
    expect(last.length).toBeGreaterThan(0)
    expect(last).not.toBe('Open Enter')
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(focusedText()).toBe('Open Enter')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(focusedText()).toBe(last)
    fireEvent.keyDown(document.activeElement!, { key: 'Home' })
    expect(focusedText()).toBe('Open Enter')

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('context-menu')).toBeNull())
    expect(document.activeElement).toBe(grid())
    expect(headerIds()).toEqual(allColumns)
  })

  it('opens with the ContextMenu key and Enter hides the active column', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(screen.getByText('ART-3'))
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-3'))
    fireEvent.keyDown(grid(), { key: 'ContextMenu' })
    await screen.findByTestId('context-menu')
    await waitFor(() => expect(focusedText()).toBe('Open Enter'))

    for (let step = 0; step < 10 && focusedText() !== 'Hide column'; step += 1) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    }
    expect(focusedText()).toBe('Hide column')
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })

    await waitFor(() => expect(headerIds()).toEqual(['col-name', 'col-type', 'col-status', 'col-version']))
    expect(screen.queryByTestId('context-menu')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(grid()))
  })

  it('opens with Shift+F10 for the focused header column, not the active cell', async () => {
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.click(screen.getByText('Two'))
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('id-2'))
    expect(document.querySelector('.row.selected .active-cell')?.getAttribute('data-column')).toBe('name')

    const header = screen.getByTestId('col-type')
    fireEvent.click(header)
    expect(document.querySelector('.row.selected .active-cell')?.getAttribute('data-column')).toBe('type')

    fireEvent.click(screen.getByText('Two'))
    expect(document.querySelector('.row.selected .active-cell')?.getAttribute('data-column')).toBe('name')

    const label = within(header).getByRole('button', { name: 'Type' })
    label.focus()
    fireEvent.keyDown(label, { key: 'F10', shiftKey: true })

    const menu = await screen.findByTestId('context-menu')
    expect(menu.getAttribute('aria-label')).toBe('Type')
    expect(within(menu).getByRole('menuitem', { name: 'Hide column' })).toBeTruthy()
  })
})

describe('palette column entries', () => {
  function captured() {
    const events: Array<{ name: string; args: unknown }> = []
    const stop = onUi((event) => {
      if (event.name === 'ui.hide_column' || event.name === 'ui.show_column') events.push({ name: event.name, args: event.args })
    })
    return { events, stop }
  }

  beforeEach(() => {
    publishColumns('table', [
      { id: 'key', header: 'Number', hidden: false },
      { id: 'name', header: 'Name', hidden: false },
      { id: 'status', header: 'Status', hidden: true },
    ])
  })

  it('runs Hide column › for a visible column', async () => {
    const { events, stop } = captured()
    render(<PaletteHarness />)
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'hide column' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /Hide column ›/ })).toBeTruthy())
    expect(screen.queryByRole('option', { name: /Show column ›/ })).toBeNull()

    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['NumberHide column', 'NameHide column']))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(events).toEqual([{ name: 'ui.hide_column', args: { column: 'name' } }])
    stop()
  })

  it('opens Select fields from the palette instead of Show column', async () => {
    render(<PaletteHarness />)
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'select fields' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /Select fields ›/ })).toBeTruthy())
    expect(screen.queryByRole('option', { name: /Show column ›/ })).toBeNull()

    fireEvent.keyDown(input, { key: 'Enter' })
    // Fields › is a palette mode (not the old inline field-picker).
    await waitFor(() => expect(screen.getByTestId('command-palette')).toBeTruthy())
    expect(screen.getByText(/Open an object table to select fields/i)).toBeTruthy()
  })
})

describe('palette entities', () => {
  function EntityHarness() {
    const [queryClient] = useState(client)
    const session = useMemo(
      () => ({
        objectId: null,
        setObjectId: () => undefined,
        setProposalId: () => undefined,
        push: () => undefined,
        openWorkspace: () => undefined,
      }),
      [],
    )
    return (
      <QueryClientProvider client={queryClient}>
        <CommandPalette
          session={session}
          workspaces={[{ id: 'ws-1', name: 'Review' }]}
          views={[{ id: 'view-1', title: 'Articles', type: 'object_table' }]}
          onClose={() => undefined}
        />
      </QueryClientProvider>
    )
  }

  it('sends a workspace id without the workspace: prefix when placing it', async () => {
    const events: Array<{ name: string; args: unknown }> = []
    const stop = onUi((event) => {
      if (event.name === 'ui.place') events.push({ name: event.name, args: event.args })
    })
    render(<EntityHarness />)
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'Review' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /Open workspace/ })).toBeTruthy())
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(screen.getByRole('option', { name: /Place left/ })).toBeTruthy())
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(events).toEqual([{ name: 'ui.place', args: { id: 'ws-1', zone: 'left' } }])
    stop()
  })

  it('shows the display name of a search hit and points aria-activedescendant at that row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/search')) {
          return json({
            found: 1,
            hits: [{ document: { id: 'art-1', key: 'ART-1', type_key: 'article', display_name: 'Cheddar', a_namn__sv: 'Ost' } }],
          })
        }
        if (url.includes('/v1/definitions')) return json({ types: [], attributes: [], structures: [] })
        if (url.includes('/v1/frecency')) return json({ entries: {} })
        if (url.includes('/v1/operations')) return json({ operations: [] })
        return json({})
      }),
    )
    render(<EntityHarness />)
    const input = (await screen.findByTestId('palette-input')) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ched' } })
    const hit = await screen.findByRole('option', { name: /ART-1 · Cheddar/ })
    expect(hit.textContent).not.toContain('Ost')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => {
      const active = document.querySelector('.hit.on')
      expect(active).toBeTruthy()
      expect(input.getAttribute('aria-activedescendant')).toBe(active?.id)
    })
    expect(document.getElementById(input.getAttribute('aria-activedescendant') ?? '')).toBeTruthy()
  })

  it('keeps the palette open when a layout command runs before the workspace is ready', async () => {
    const message = vi.spyOn(toast, 'message').mockReturnValue(0)
    const closed = vi.fn()
    const [queryClient] = [client()]
    render(
      <QueryClientProvider client={queryClient}>
        <CommandPalette
          session={{
            objectId: null,
            setObjectId: () => undefined,
            setProposalId: () => undefined,
            push: () => undefined,
            openWorkspace: () => undefined,
          }}
          workspaceReady={false}
          views={[]}
          workspaces={[]}
          onClose={closed}
        />
      </QueryClientProvider>,
    )
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'Move view left' } })
    await waitFor(() => expect(screen.getAllByRole('option', { name: /Move view left/ }).length).toBeGreaterThan(0))
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(message).toHaveBeenCalledWith('Opening when the workspace is ready…')
    expect(closed).not.toHaveBeenCalled()
    expect(screen.getByTestId('command-palette')).toBeTruthy()
    message.mockRestore()
  })
})

describe('object table loading vs empty', () => {
  it('renders the toolbar immediately, waits for the response, and only then shows no-match text', async () => {
    let searchCalls = 0
    let releaseInitial!: () => void
    let releaseFilter!: () => void
    const initialGate = new Promise<void>((resolve) => {
      releaseInitial = resolve
    })
    const filterGate = new Promise<void>((resolve) => {
      releaseFilter = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/search')) {
          if (url.includes('group=groups')) return json({ groups: [] })
          searchCalls += 1
          if (searchCalls === 1) {
            await initialGate
            return json({
              found: tableRows.length,
              hits: tableRows.map((name, index) => ({
                document: {
                  id: `id-${index}`,
                  key: `ART-${index}`,
                  type_key: 'article',
                  version: '1',
                  a_name__en: name,
                  a_status: 'ok',
                },
              })),
            })
          }
          if (searchCalls === 2) {
            await filterGate
            return json({ found: 0, hits: [] })
          }
          return json({ found: 0, hits: [] })
        }
        if (url.includes('/v1/definitions')) {
          return json({ types: [], attributes: [], unit_families: [], structures: [] })
        }
        if (url.includes('/v1/assortments')) return json({ assortments: [] })
        if (url.includes('/v1/frecency')) return json({ entries: {} })
        return json({})
      }),
    )

    render(<TableHarness />)

    await waitFor(() => expect(screen.getByTestId('object-table-loading')).toBeTruthy())
    expect(screen.getByTestId('standard-table-bar')).toBeTruthy()
    expect(screen.queryByTestId('object-table-empty')).toBeNull()

    releaseInitial()
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length))

    fireEvent.change(screen.getByTestId('quick-filter'), { target: { value: 'zzz' } })
    await waitFor(() => expect(searchCalls).toBe(2))
    expect(screen.getByTestId('standard-table-bar')).toBeTruthy()
    expect(screen.queryByTestId('object-table-empty')).toBeNull()

    releaseFilter()
    await waitFor(() => expect(screen.getByTestId('object-table-empty')).toBeTruthy())
    expect(screen.getByText('No matches for “zzz”.')).toBeTruthy()
    expect(screen.getByText(copy.noMatchesHint)).toBeTruthy()
    fireEvent.click(screen.getByTestId('clear-search'))
    await waitFor(() => expect((screen.getByTestId('quick-filter') as HTMLInputElement).value).toBe(''))
  })
})
