// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectTable, type PanesSession, type PanesView } from './panes'
import { publishMarked, readSelection, resetUiContext } from './ui-context'

const product = '018f0000-0000-7000-8000-000000000200'
const article = '018f0000-0000-7000-8000-000000000201'

const productRow = {
  id: product,
  key: 'PRD-1',
  type_key: 'product',
  version: '1',
  a_name__en: 'Product one',
  a_status: 'ok',
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

const productsView: PanesView = {
  id: 'products',
  type: 'object_table',
  title: 'Products',
  state: { object_type: product, type_key: 'product' },
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function Harness({ objectId, view }: { objectId: string | null; view: PanesView }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId,
      proposalId: null,
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [objectId],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ObjectTable session={session} view={view} workspace={{ id: 'ws' }} />
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
        return json({ found: 1, hits: [{ document: productRow }] })
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

describe('reload selection restore', () => {
  it('adopts the URL object as the table selection', async () => {
    publishMarked(product, 'product')
    render(<Harness objectId={product} view={productsView} />)
    const row = await screen.findByTestId('object-row')
    await waitFor(() => expect(row.getAttribute('aria-selected')).toBe('true'))
    expect(readSelection('products').map((item) => item.id)).toEqual([product])
  })

  it('does not adopt a marked object of another type', async () => {
    publishMarked(article, 'article')
    render(<Harness objectId={article} view={productsView} />)
    const row = await screen.findByTestId('object-row')
    await waitFor(() => expect(readSelection('products')).toEqual([]))
    expect(row.getAttribute('aria-selected')).toBe('false')
  })

  it('does not adopt the marked object in a peer-sourced table', async () => {
    publishMarked(product, 'product')
    render(
      <Harness
        objectId={product}
        view={{
          ...productsView,
          state: { ...productsView.state, source: { kind: 'peer', viewId: 'articles', selection: 'row' } },
        }}
      />,
    )
    await screen.findByTestId('peer-empty-text')
    await waitFor(() => expect(readSelection('products')).toEqual([]))
  })
})
