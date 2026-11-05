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
