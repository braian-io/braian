// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tabGroup } from './layout'
import { ObjectDetail } from './panes'
import { activeListOf, detailForSelection, useDetailFollow, type DetailFollowDoc } from './detail-follow'
import { publishSelection, resetUiContext } from './ui-context'

const viewList = [
  { id: 'tree', type: 'structure_tree' },
  { id: 'products', type: 'object_table' },
  { id: 'articles', type: 'object_table' },
]

function doc(focus: string): DetailFollowDoc {
  return { layout: tabGroup(['tree', 'products', 'articles']), focus }
}

function Harness({ current }: { current: DetailFollowDoc }) {
  const [objectId, setObjectId] = useState<string | null>('old')
  useDetailFollow(current, viewList, true, setObjectId)
  return <div data-testid="detail">{objectId ?? 'empty'}</div>
}

afterEach(() => {
  cleanup()
  resetUiContext()
  vi.unstubAllGlobals()
})

describe('detail follows the active list', () => {
  it('resets to the new list of selected row when the active list changes', async () => {
    publishSelection('products', [{ id: 'old', key: 'OLD', name: 'Old', type: 'product' }])
    publishSelection('articles', [{ id: 'new', key: 'NEW', name: 'New', type: 'article' }])
    const view = render(<Harness current={doc('products')} />)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('old'))

    view.rerender(<Harness current={doc('articles')} />)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('new'))
  })

  it('shows the empty state when the new list has no selected row', async () => {
    publishSelection('products', [{ id: 'old', key: 'OLD', name: 'Old', type: 'product' }])
    const view = render(<Harness current={doc('products')} />)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('old'))

    publishSelection('articles', [])
    view.rerender(<Harness current={doc('articles')} />)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('empty'))
  })

  it('keeps the shown object when the new list contains it', async () => {
    publishSelection('products', [{ id: 'old', key: 'OLD', name: 'Old', type: 'product' }])
    const view = render(<Harness current={doc('products')} />)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('old'))

    publishSelection('articles', [{ id: 'old', key: 'OLD', name: 'Old', type: 'product' }])
    view.rerender(<Harness current={doc('articles')} />)
    await waitFor(() => expect(screen.getByTestId('detail').textContent).toBe('old'))
  })
})

describe('detail empty state', () => {
  it('asks for a row when the active list has none', () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ types: [], attributes: [], structures: [] })))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const session = {
      group: null,
      objectId: null,
      proposalId: null,
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }
    render(
      <QueryClientProvider client={client}>
        <ObjectDetail session={session} />
      </QueryClientProvider>,
    )
    expect(screen.getByTestId('detail-empty').textContent).toContain('Select a row to see its details.')
  })
})

describe('activeListOf', () => {
  it('follows the focused table, then the last list, then the first table', () => {
    expect(activeListOf(doc('articles'), viewList, 'products')).toBe('articles')
    expect(activeListOf(doc('tree'), viewList, 'articles')).toBe('articles')
    expect(activeListOf(doc('tree'), viewList, null)).toBe('products')
    expect(activeListOf(doc('tree'), viewList, 'missing-view')).toBe('products')
  })
})

describe('detailForSelection', () => {
  it('keeps a row that belongs to the list and otherwise picks its first row', () => {
    const selection = [{ id: 'new', key: 'NEW', name: 'New', type: 'article' }]
    expect(detailForSelection('old', selection)).toBe('new')
    expect(detailForSelection('new', selection)).toBe('new')
    expect(detailForSelection(null, selection)).toBe('new')
    expect(detailForSelection('old', [])).toBeNull()
  })
})
