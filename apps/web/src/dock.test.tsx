// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceDock, catalogRatioToFullDockPin } from './dock'
import { views, type LayoutDoc } from './layout'

afterEach(() => {
  cleanup()
})

const doc: LayoutDoc = {
  id: 'ws',
  title: 'Workspace',
  layout: { type: 'tabs', views: ['products', 'graph'], active: 0 },
  focus: 'products',
}

it('renders the tab close control as a keyboard-reachable button', () => {
  const onChange = vi.fn()
  render(
    <WorkspaceDock
      doc={doc}
      views={[
        { id: 'products', title: 'Products', type: 'object_table' },
        { id: 'graph', title: 'Graph', type: 'graph' },
      ]}
      onChange={onChange}
      renderView={() => <div />}
      onAddView={() => undefined}
    />,
  )

  const close = screen.getByTestId('close-tab-products')
  expect(close.tagName).toBe('BUTTON')
  expect(close.getAttribute('type')).toBe('button')
  expect(close.getAttribute('aria-label')).toBe('Close tab')
  expect(close.getAttribute('title')).toBe('Close Products')

  fireEvent.click(close)
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(views(onChange.mock.calls[0]?.[0].layout)).toEqual(['graph'])
})

it('lets every cell give way in a split that contains Detail', () => {
  const layout: LayoutDoc = {
    id: 'ws',
    title: 'Workspace',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.4, 0.3, 0.3],
      children: [
        { type: 'tabs', views: ['products'], active: 0 },
        { type: 'tabs', views: ['graph'], active: 0 },
        { type: 'tabs', views: ['detail'], active: 0 },
      ],
    },
    focus: 'products',
  }
  const { container } = render(
    <WorkspaceDock
      doc={layout}
      views={[
        { id: 'products', title: 'Products', type: 'object_table' },
        { id: 'graph', title: 'Graph', type: 'graph' },
        { id: 'detail', title: 'Detail', type: 'object_detail' },
      ]}
      onChange={() => undefined}
      renderView={() => <div />}
      onAddView={() => undefined}
    />,
  )

  const cells = [...container.querySelectorAll<HTMLElement>('.split-cell')]
  expect(cells.map((cell) => cell.style.flex.split(' ').slice(0, 2).join(' '))).toEqual(['0 1', '0 1', '0 1'])
})

it('marks a nested Products split that contains Detail so the table can keep its floor', () => {
  const layout: LayoutDoc = {
    id: 'ws',
    title: 'Products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.22, 0.78],
      children: [
        { type: 'tabs', views: ['tree'], active: 0 },
        {
          type: 'split',
          dir: 'horizontal',
          ratios: [0.5, 0.5],
          children: [
            { type: 'tabs', views: ['products'], active: 0 },
            {
              type: 'split',
              dir: 'horizontal',
              ratios: [0.5, 0.5],
              children: [
                { type: 'tabs', views: ['articles'], active: 0 },
                { type: 'tabs', views: ['detail'], active: 0 },
              ],
            },
          ],
        },
      ],
    },
    focus: 'products',
  }
  const { container } = render(
    <WorkspaceDock
      doc={layout}
      views={[
        { id: 'tree', title: 'Food', type: 'structure_tree' },
        { id: 'products', title: 'Products', type: 'object_table' },
        { id: 'articles', title: 'Articles', type: 'object_table' },
        { id: 'detail', title: 'Detail', type: 'object_detail' },
      ]}
      onChange={() => undefined}
      renderView={() => <div />}
      onAddView={() => undefined}
    />,
  )
  const middle = container.querySelector<HTMLElement>(".split.horizontal[data-path='1']")
  expect(middle?.dataset.hasDetail).toBe('true')
  const cells = [...(middle?.querySelectorAll<HTMLElement>(':scope > .split-cell') ?? [])]
  expect(cells.map((cell) => cell.style.flex.split(' ').slice(0, 2).join(' '))).toEqual(['0 1', '0 1'])
  expect(cells.map((cell) => cell.style.position)).toEqual(['', ''])
})

it('scales a tree pin measured inside the catalog column to full-dock width', () => {
  expect(catalogRatioToFullDockPin({ width: 154, ratio: 0.22 }, 0.7)).toEqual({ width: 220, ratio: 0.22 })
  expect(catalogRatioToFullDockPin({ width: 154, ratio: 0.22 }, null)).toEqual({ width: 154, ratio: 0.22 })
})

it('pins the structure tree when the layout loads with the agent dock already open', async () => {
  const viewSpecs = [
    { id: 'tree', title: 'Food', type: 'structure_tree' },
    { id: 'products', title: 'Products', type: 'object_table' },
    { id: 'detail', title: 'Detail', type: 'object_detail' },
    { id: 'agent', title: 'Ask', type: 'agent' },
  ]
  const catalog = {
    type: 'split' as const,
    dir: 'horizontal' as const,
    ratios: [0.22, 0.78],
    children: [
      { type: 'tabs' as const, views: ['tree'], active: 0 },
      {
        type: 'split' as const,
        dir: 'horizontal' as const,
        ratios: [0.55, 0.45],
        children: [
          { type: 'tabs' as const, views: ['products'], active: 0 },
          { type: 'tabs' as const, views: ['detail'], active: 0 },
        ],
      },
    ],
  }
  const open: LayoutDoc = {
    id: 'ws',
    title: 'Products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.7, 0.3],
      children: [catalog, { type: 'tabs', views: ['agent'], active: 0 }],
    },
    focus: 'products',
  }
  const rect = (width: number) =>
    ({ x: 0, y: 0, width, height: 600, top: 0, left: 0, right: width, bottom: 600, toJSON() { return {} } }) as DOMRect
  const catalogWidth = 0.7 * 800
  const treeWidthInCatalog = 0.22 * catalogWidth
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const treeCell = this.classList.contains('split-cell') && this.querySelector("[data-view-type='structure_tree']")
    return rect(treeCell ? treeWidthInCatalog : 800)
  })
  try {
    const { container } = render(
      <WorkspaceDock doc={open} views={viewSpecs} onChange={() => undefined} renderView={() => <div />} onAddView={() => undefined} />,
    )
    const treeSplit = await waitFor(() => {
      const split = container.querySelector<HTMLElement>(".split.horizontal[data-tree-pinned='true']")
      const cell = split?.querySelector<HTMLElement>(':scope > .split-cell')
      expect(Number.parseFloat(cell?.style.width ?? '0')).toBeCloseTo(0.22 * 800, 4)
      return split
    })
    const treeCells = [...(treeSplit?.querySelectorAll<HTMLElement>(':scope > .split-cell') ?? [])]
    expect(Number.parseFloat(treeCells[0]?.style.width ?? '0')).toBeCloseTo(0.22 * 800, 4)
  } finally {
    spy.mockRestore()
  }
})

it('pins the structure tree to the width measured before the agent dock opens', () => {
  const views = [
    { id: 'tree', title: 'Food', type: 'structure_tree' },
    { id: 'products', title: 'Products', type: 'object_table' },
    { id: 'detail', title: 'Detail', type: 'object_detail' },
    { id: 'agent', title: 'Ask', type: 'agent' },
  ]
  const catalog = {
    type: 'split' as const,
    dir: 'horizontal' as const,
    ratios: [0.22, 0.78],
    children: [
      { type: 'tabs' as const, views: ['tree'], active: 0 },
      {
        type: 'split' as const,
        dir: 'horizontal' as const,
        ratios: [0.55, 0.45],
        children: [
          { type: 'tabs' as const, views: ['products'], active: 0 },
          { type: 'tabs' as const, views: ['detail'], active: 0 },
        ],
      },
    ],
  }
  const closed: LayoutDoc = { id: 'ws', title: 'Products', layout: catalog, focus: 'products' }
  const open: LayoutDoc = {
    id: 'ws',
    title: 'Products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.7, 0.3],
      children: [catalog, { type: 'tabs', views: ['agent'], active: 0 }],
    },
    focus: 'products',
  }
  const rect = (width: number) =>
    ({ x: 0, y: 0, width, height: 600, top: 0, left: 0, right: width, bottom: 600, toJSON() { return {} } }) as DOMRect
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const treeCell = this.classList.contains('split-cell') && this.querySelector("[data-view-type='structure_tree']")
    return rect(treeCell ? 240 : 800)
  })
  try {
    const { container, rerender } = render(
      <WorkspaceDock doc={closed} views={views} onChange={() => undefined} renderView={() => <div />} onAddView={() => undefined} />,
    )
    rerender(
      <WorkspaceDock doc={open} views={views} onChange={() => undefined} renderView={() => <div />} onAddView={() => undefined} />,
    )
    const treeSplit = container.querySelector<HTMLElement>(".split.horizontal[data-tree-pinned='true']")
    expect(treeSplit?.dataset.treePinned).toBe('true')
    const treeCells = [...(treeSplit?.querySelectorAll<HTMLElement>(':scope > .split-cell') ?? [])]
    expect(treeCells[0]?.style.flex).toBe('0 0 240px')
    expect(treeCells[0]?.style.width).toBe('240px')
    expect(treeCells[1]?.style.flex).toBe('1 1 0px')
  } finally {
    spy.mockRestore()
  }
})

it('does not mark the agent dock wrapper as a detail split', () => {
  const layout: LayoutDoc = {
    id: 'ws',
    title: 'Workspace',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.7, 0.3],
      children: [
        {
          type: 'split',
          dir: 'horizontal',
          ratios: [0.55, 0.45],
          children: [
            { type: 'tabs', views: ['products'], active: 0 },
            { type: 'tabs', views: ['detail'], active: 0 },
          ],
        },
        { type: 'tabs', views: ['agent'], active: 0 },
      ],
    },
    focus: 'products',
  }
  const { container } = render(
    <WorkspaceDock
      doc={layout}
      views={[
        { id: 'products', title: 'Products', type: 'object_table' },
        { id: 'detail', title: 'Detail', type: 'object_detail' },
        { id: 'agent', title: 'Ask', type: 'agent' },
      ]}
      onChange={() => undefined}
      renderView={() => <div />}
      onAddView={() => undefined}
    />,
  )
  const outer = container.querySelector<HTMLElement>(".split.horizontal[data-path='root']")
  const inner = container.querySelector<HTMLElement>(".split.horizontal[data-path='0']")
  expect(outer?.dataset.hasDetail).toBeUndefined()
  expect(inner?.dataset.hasDetail).toBe('true')
  expect(inner?.dataset.catalogFrozen).toBeUndefined()
  const innerCells = [...(inner?.querySelectorAll<HTMLElement>(':scope > .split-cell') ?? [])]
  expect(innerCells.map((cell) => cell.style.flex.split(' ').slice(0, 2).join(' '))).toEqual(['0 1', '0 1'])
  const outerCells = [...(outer?.querySelectorAll<HTMLElement>(':scope > .split-cell') ?? [])]
  expect(outer?.dataset.agentDock).toBe('true')
  expect(outerCells.map((cell) => cell.style.flex.split(' ').slice(0, 2).join(' '))).toEqual(['0 0', '0 0'])
})

it('keeps a positive shell width on the first closed frame so the close can animate', () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? false : query.includes('max-width: 1359px'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  const views = [
    { id: 'products', title: 'Products', type: 'object_table' },
    { id: 'detail', title: 'Detail', type: 'object_detail' },
    { id: 'agent', title: 'Ask', type: 'agent' },
  ]
  const open: LayoutDoc = {
    id: 'ws',
    title: 'Products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.7, 0.3],
      children: [
        {
          type: 'split',
          dir: 'horizontal',
          ratios: [0.6, 0.4],
          children: [
            { type: 'tabs', views: ['products'], active: 0 },
            { type: 'tabs', views: ['detail'], active: 0 },
          ],
        },
        { type: 'tabs', views: ['agent'], active: 0 },
      ],
    },
    focus: 'agent',
  }
  const closed: LayoutDoc = {
    ...open,
    focus: 'products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [1, 0],
      children: [
        open.layout.children[0]!,
        { type: 'tabs', views: [], active: 0 },
      ],
    },
  }
  const root = { clientWidth: 1280 } as HTMLDivElement
  const rect = (width: number) =>
    ({ x: 0, y: 0, width, height: 600, top: 0, left: 0, right: width, bottom: 600, toJSON() { return {} } }) as DOMRect
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const shell = this.dataset.agentDockCell === 'true'
    return rect(shell ? 200 : 1280)
  })
  const { container, rerender } = render(
    <WorkspaceDock doc={open} views={views} onChange={() => undefined} renderView={() => <div data-testid="view" />} onAddView={() => undefined} />,
  )
  rerender(
    <WorkspaceDock doc={closed} views={views} onChange={() => undefined} renderView={() => <div data-testid="view" />} onAddView={() => undefined} />,
  )
  const cell = container.querySelector<HTMLElement>('[data-agent-dock-cell="true"]')
  expect(Number.parseFloat(cell?.style.width ?? '0')).toBeGreaterThan(1)
  spy.mockRestore()
})

it('keeps the same agent shell cell when the dock closes', () => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  const views = [
    { id: 'products', title: 'Products', type: 'object_table' },
    { id: 'detail', title: 'Detail', type: 'object_detail' },
    { id: 'agent', title: 'Ask', type: 'agent' },
  ]
  const catalog = {
    type: 'split' as const,
    dir: 'horizontal' as const,
    ratios: [0.6, 0.4],
    children: [
      { type: 'tabs' as const, views: ['products'], active: 0 },
      { type: 'tabs' as const, views: ['detail'], active: 0 },
    ],
  }
  const open: LayoutDoc = {
    id: 'ws',
    title: 'Products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.7, 0.3],
      children: [catalog, { type: 'tabs', views: ['agent'], active: 0 }],
    },
    focus: 'agent',
  }
  const closed: LayoutDoc = {
    ...open,
    focus: 'products',
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [1, 0],
      children: [catalog, { type: 'tabs', views: [], active: 0 }],
    },
  }
  const { container, rerender } = render(
    <WorkspaceDock doc={open} views={views} onChange={() => undefined} renderView={() => <div />} onAddView={() => undefined} />,
  )
  const cell = container.querySelector<HTMLElement>('[data-agent-dock-cell="true"]')
  expect(cell).toBeTruthy()
  ;(cell as HTMLElement & { __row281?: number }).__row281 = 281
  expect(container.querySelector('[data-agent-shell="true"]')).toBeTruthy()
  rerender(
    <WorkspaceDock doc={closed} views={views} onChange={() => undefined} renderView={() => <div />} onAddView={() => undefined} />,
  )
  const again = container.querySelector<HTMLElement>('[data-agent-dock-cell="true"]')
  expect(again).toBe(cell)
  expect((again as HTMLElement & { __row281?: number }).__row281).toBe(281)
  expect(again?.style.width).toBe('0px')
  expect(container.querySelector('[data-agent-shell="true"]')).toBeTruthy()
  expect(container.querySelector('[data-agent-dock="true"]')).toBeNull()
})

it('keeps the full tab title on the truncated tab button', () => {
  const title = 'A very long view title that the tab strip truncates'
  render(
    <WorkspaceDock
      doc={{ ...doc, layout: { type: 'tabs', views: ['long'], active: 0 }, focus: 'long' }}
      views={[{ id: 'long', title, type: 'object_table' }]}
      onChange={() => undefined}
      renderView={() => <div />}
      onAddView={() => undefined}
    />,
  )

  const open = screen.getByText(title).closest('button')
  expect(open?.getAttribute('title')).toBe(title)
})
