// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceDock } from './dock'
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

it('pins the structure tree width when the agent dock is open', () => {
  const layout: LayoutDoc = {
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
          ratios: [0.22, 0.78],
          children: [
            { type: 'tabs', views: ['tree'], active: 0 },
            {
              type: 'split',
              dir: 'horizontal',
              ratios: [0.55, 0.45],
              children: [
                { type: 'tabs', views: ['products'], active: 0 },
                { type: 'tabs', views: ['detail'], active: 0 },
              ],
            },
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
        { id: 'tree', title: 'Food', type: 'structure_tree' },
        { id: 'products', title: 'Products', type: 'object_table' },
        { id: 'detail', title: 'Detail', type: 'object_detail' },
        { id: 'agent', title: 'Ask', type: 'agent' },
      ]}
      onChange={() => undefined}
      renderView={() => <div />}
      onAddView={() => undefined}
    />,
  )
  const treeSplit = container.querySelector<HTMLElement>(".split.horizontal[data-tree-pinned='true']")
  expect(treeSplit?.dataset.treePinned).toBe('true')
  const treeCells = [...(treeSplit?.querySelectorAll<HTMLElement>(':scope > .split-cell') ?? [])]
  expect(treeCells[0]?.style.flex).toMatch(/^0 0 calc/)
  expect(treeCells[0]?.style.flex).toContain('agent-dock-catalog-ratio')
  expect(treeCells[1]?.style.flex).toBe('1 1 0px')
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
  expect(outer?.style.getPropertyValue('--agent-dock-catalog-ratio')).toBe('0.7')
  expect(outerCells.map((cell) => cell.style.flex.split(' ').slice(0, 2).join(' '))).toEqual(['0 0', '0 0'])
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
