// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchColumnMove, resolveColumnMoveTarget } from './column-move'
import { ObjectTable, type PanesSession } from './panes'
import { SharedContextMenuHost } from './shared-context-menu'
import { dispatchUi, onUi } from './ui-bus'
import { publishActiveColumn, publishFrame, resetUiContext } from './ui-context'

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

const tableRows = ['Zero', 'One', 'Two']
const products = '018f1000-0000-7000-8000-000000000101'
const articles = '018f1000-0000-7000-8000-000000000102'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function Frame(focused: string) {
  publishFrame({
    workspace: { id: 'ws', name: 'Two tables' },
    panes: [
      { id: products, type: 'object_table', title: 'Products', focused: focused === products },
      { id: articles, type: 'object_table', title: 'Articles', focused: focused === articles },
    ],
    focused,
    language: 'en',
  })
}

function TwoTableHarness() {
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
  return (
    <QueryClientProvider client={queryClient}>
      <SharedContextMenuHost />
      <div data-testid="products-pane">
        <ObjectTable
          session={session}
          view={{ id: products, type: 'object_table', title: 'Products', state: {} }}
          workspace={{ id: 'ws' }}
        />
      </div>
      <div data-testid="articles-pane">
        <ObjectTable
          session={session}
          view={{ id: articles, type: 'object_table', title: 'Articles', state: {} }}
          workspace={{ id: 'ws' }}
        />
      </div>
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
        return json({ types: [], attributes: [], unit_families: [], structures: [] })
      }
      if (url.includes('/v1/frecency')) return json({ entries: {} })
      return json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function columnIds(pane: 'products-pane' | 'articles-pane') {
  const node = screen.getByTestId(pane)
  return Array.from(node.querySelectorAll('.head [data-testid^="col-"]'))
    .map((item) => (item.getAttribute('data-testid') ?? '').slice('col-'.length))
}

function position(pane: 'products-pane' | 'articles-pane', column: string) {
  return columnIds(pane).indexOf(column)
}

describe('column move targets one table (Notion 107)', () => {
  it('resolves the most recently activated column, not the focused table', () => {
    Frame(products)
    publishActiveColumn(products, 'name')
    publishActiveColumn(articles, 'status')

    // The latest header activation wins even while another pane holds focus.
    expect(resolveColumnMoveTarget()).toEqual({ viewId: articles, column: 'status' })
    expect(resolveColumnMoveTarget({ viewId: products })).toEqual({ viewId: products, column: 'name' })
    expect(resolveColumnMoveTarget({ viewId: articles, column: 'name' })).toEqual({ viewId: articles, column: 'name' })

    // Re-activating the same column still makes it the latest target.
    publishActiveColumn(products, 'name')
    expect(resolveColumnMoveTarget()).toEqual({ viewId: products, column: 'name' })

    // A palette opened while focus sits outside the tables still targets the
    // table whose header was activated last, never both tables.
    Frame('detail')
    expect(resolveColumnMoveTarget()).toEqual({ viewId: products, column: 'name' })
  })

  it('keeps the last activation when a remounting table republishes no column', () => {
    Frame(products)
    publishActiveColumn(products, 'type')
    publishActiveColumn(articles, 'name')

    // A table reports a null active column before its first activation and after
    // a remount. That must not erase the header the user clicked last.
    publishActiveColumn(articles, null)
    expect(resolveColumnMoveTarget()).toEqual({ viewId: articles, column: 'name' })

    const seen: Array<Record<string, unknown>> = []
    const stop = onUi((event) => {
      if (event.name === 'ui.move_column') seen.push(event.args)
    })
    act(() => {
      dispatchColumnMove('right')
    })
    stop()
    expect(seen[0]).toMatchObject({ column: 'name', direction: 'right', viewId: articles })

    // Seq 2 mirror: Articles cell, Products header Name, move right, then a
    // remount of Products must still leave the chord targeting Products Name.
    publishActiveColumn(articles, 'type')
    publishActiveColumn(products, 'name')
    publishActiveColumn(products, null)
    expect(resolveColumnMoveTarget()).toEqual({ viewId: products, column: 'name' })
  })

  it('records a clicked header as the target even when another pane keeps focus', async () => {
    Frame(products)
    render(<TwoTableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length * 2))

    const productsName = screen.getByTestId('products-pane').querySelector('[data-testid="col-name"]') as HTMLElement
    const articlesName = screen.getByTestId('articles-pane').querySelector('[data-testid="col-name"]') as HTMLElement

    fireEvent.click(productsName)
    await waitFor(() => expect(resolveColumnMoveTarget()).toEqual({ viewId: products, column: 'name' }))

    Frame(articles)
    fireEvent.click(articlesName)
    await waitFor(() => expect(resolveColumnMoveTarget()).toEqual({ viewId: articles, column: 'name' }))

    // Products keeps Name active, so a repeat click changes no state; the target
    // must still switch back to Products instead of following the focused pane.
    fireEvent.click(productsName)
    await waitFor(() => expect(resolveColumnMoveTarget()).toEqual({ viewId: products, column: 'name' }))
  })

  it('moves only the named table when two tables share the Name field', async () => {
    Frame(products)
    render(<TwoTableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length * 2))
    await waitFor(() => expect(position('products-pane', 'name')).toBeGreaterThanOrEqual(1))
    const before = { products: columnIds('products-pane'), articles: columnIds('articles-pane') }

    act(() => {
      dispatchColumnMove('right', { column: 'name', viewId: products })
    })
    await waitFor(() => expect(position('products-pane', 'name')).toBe(before.products.indexOf('name') + 1))
    expect(columnIds('articles-pane')).toEqual(before.articles)

    // Focus follows the other table; the explicit Products target must still win.
    act(() => {
      Frame(articles)
      dispatchColumnMove('left', { column: 'name', viewId: products })
    })
    await waitFor(() => expect(columnIds('products-pane')).toEqual(before.products))
    expect(columnIds('articles-pane')).toEqual(before.articles)

    // Header and Ctrl+K share this runner: an explicit Articles target moves only Articles.
    act(() => {
      dispatchColumnMove('right', { column: 'name', viewId: articles })
    })
    await waitFor(() => expect(position('articles-pane', 'name')).toBe(before.articles.indexOf('name') + 1))
    expect(columnIds('products-pane')).toEqual(before.products)

    // The agent path arrives as ui.move_column; it carries the same view id.
    act(() => {
      dispatchUi('ui.move_column', { column: 'name', direction: 'left', viewId: products })
    })
    await waitFor(() => expect(position('products-pane', 'name')).toBe(0))
    expect(position('articles-pane', 'name')).toBe(before.articles.indexOf('name') + 1)

    // Legal boundary: moving the first column left is a no-op and does not leak.
    act(() => {
      dispatchColumnMove('left', { column: 'name', viewId: products })
    })
    expect(position('products-pane', 'name')).toBe(0)
    expect(position('articles-pane', 'name')).toBe(before.articles.indexOf('name') + 1)
  })

  it('keeps a legacy event without a view id on the focused table', async () => {
    Frame(products)
    render(<TwoTableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(tableRows.length * 2))
    const before = { products: columnIds('products-pane'), articles: columnIds('articles-pane') }

    const seen: Array<Record<string, unknown>> = []
    const stop = onUi((event) => {
      if (event.name === 'ui.move_column') seen.push(event.args)
    })
    act(() => {
      dispatchColumnMove('right', { column: 'name' })
    })
    stop()

    expect(seen[0]).toMatchObject({ column: 'name', direction: 'right', viewId: products })
    await waitFor(() => expect(position('products-pane', 'name')).toBe(before.products.indexOf('name') + 1))
    expect(columnIds('articles-pane')).toEqual(before.articles)
  })
})
