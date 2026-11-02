// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectTable, type PanesSession } from './panes'
import { readSelection, resetUiContext } from './ui-context'

const product = '018f0000-0000-7000-8000-000000000200'
const article = '018f0000-0000-7000-8000-000000000201'

const articles = [
  { id: 'art-1', key: 'ART-1', type_key: 'article', version: '1', a_name__en: 'One', a_status: 'ok' },
  { id: 'art-2', key: 'ART-2', type_key: 'article', version: '1', a_name__en: 'Two', a_status: 'ok' },
]
const products = {
  'prod-1': { id: 'prod-1', key: 'PRD-1', type_key: 'product', version: '1', a_name__en: 'Product one', a_status: 'ok' },
  'prod-2': { id: 'prod-2', key: 'PRD-2', type_key: 'product', version: '1', a_name__en: 'Product two', a_status: 'ok' },
}

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
    scrollToIndex: () => undefined,
  }),
}))

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const articlesView = {
  id: 'articles',
  type: 'object_table',
  title: 'Articles',
  state: { object_type: article, type_key: 'article' },
}

function PeerHarness() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
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
      <div data-testid="articles-pane">
        <ObjectTable
          session={session}
          view={articlesView}
          workspace={{ id: 'ws', views: [articlesView] }}
        />
      </div>
      <div data-testid="products-pane">
        <ObjectTable
          session={session}
          view={{
            id: 'products',
            type: 'object_table',
            title: 'Products',
            state: {
              object_type: product,
              type_key: 'product',
              source: { kind: 'peer', viewId: 'articles', selection: 'row' },
            },
          }}
          workspace={{ id: 'ws', views: [articlesView] }}
        />
      </div>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  resetUiContext()
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
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/v1/search') {
        const filter = url.searchParams.get('filter') ?? ''
        if (filter.includes('type_key:=article')) {
          return json({ found: articles.length, hits: articles.map((document) => ({ document })) })
        }
        if (filter.includes('type_key:=product')) {
          const hit = Object.values(products).find((row) => filter.includes(row.id))
          return json({ found: hit ? 1 : 0, hits: hit ? [{ document: hit }] : [] })
        }
        return json({ found: 0, hits: [] })
      }
      if (url.pathname === '/v1/links') {
        const object = url.searchParams.get('object')
        const peer = object === 'art-1' ? 'prod-1' : object === 'art-2' ? 'prod-2' : ''
        return json(peer ? [{ link_type: 'related', links: [{ peer_type: 'product', peer_id: peer }] }] : [])
      }
      if (url.pathname === '/v1/definitions') {
        return json({
          languages: ['en'],
          types: [
            { id: product, key: 'product', labels: { en: 'Product' }, singular: { en: 'Product' }, plural: { en: 'Products' }, key_attribute: 'sku', attributes: [] },
            { id: article, key: 'article', labels: { en: 'Article' }, singular: { en: 'Article' }, plural: { en: 'Articles' }, key_attribute: 'sku', attributes: [] },
          ],
          attributes: [],
          structures: [],
        })
      }
      if (url.pathname === '/v1/assortments') return json({ assortments: [] })
      return json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('peer source selection', () => {
  it('never publishes the object opened in another view as this table selection', async () => {
    render(<PeerHarness />)
    const articlesPane = within(screen.getByTestId('articles-pane'))
    const productsPane = within(screen.getByTestId('products-pane'))

    const articleRows = await articlesPane.findAllByTestId('object-row')
    expect(articleRows).toHaveLength(2)
    const emptyText = await productsPane.findByTestId('peer-empty-text')
    expect(emptyText.textContent).toBe('Select a row in Articles')

    fireEvent.click(articleRows[0]!)

    await productsPane.findByTestId('object-row')
    expect(readSelection('articles').map((row) => row.id)).toEqual(['art-1'])
    // The global detail object is art-1, but this table has no row chosen by
    // the user. It must not publish art-1 as its own selection.
    await waitFor(() => expect(readSelection('products')).toEqual([]))

    fireEvent.click(productsPane.getByTestId('object-row'))
    await waitFor(() => expect(readSelection('products').map((row) => row.id)).toEqual(['prod-1']))
  })

  it('clears a selection when the peer filter moves it out of scope', async () => {
    render(<PeerHarness />)
    const articlesPane = within(screen.getByTestId('articles-pane'))
    const productsPane = within(screen.getByTestId('products-pane'))

    const articleRows = await articlesPane.findAllByTestId('object-row')
    fireEvent.click(articleRows[0]!)
    const productRow = await productsPane.findByTestId('object-row')
    fireEvent.click(productRow)
    await waitFor(() => expect(readSelection('products').map((row) => row.id)).toEqual(['prod-1']))

    fireEvent.click(articleRows[1]!)

    await waitFor(() => expect(readSelection('products')).toEqual([]))
    expect(readSelection('articles').map((row) => row.id)).toEqual(['art-2'])
  })
})
