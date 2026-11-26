// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssortmentList, SelectionHost } from './assortments'
import { requestEditSelection } from './assortment-filter'

const product = '018f0000-0000-7000-8000-000000000200'

type Doc = Record<string, unknown>

let docs: Doc[] = []
let writes: Array<{ method: string; body: Record<string, unknown> }> = []
let searches: string[] = []

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function Harness() {
  const [queryClient] = useState(client)
  const session = useMemo(
    () => ({
      group: null,
      workspaceType: 'product',
      listType: 'product',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <SelectionHost session={session} />
      <AssortmentList session={session} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  docs = [{
    id: 'a1',
    name: 'Cheese',
    type: 'product',
    type_id: product,
    kind: 'dynamic',
    query: { filter: 'type_key:=product && groups:=food:cheese' },
  }]
  writes = []
  searches = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://local')
      const method = String(init?.method ?? 'GET').toUpperCase()
      if (url.pathname === '/v1/definitions') {
        return Response.json({
          languages: ['en'],
          types: [{ id: product, key: 'product', labels: { en: 'Product' }, singular: { en: 'Product' }, plural: { en: 'Products' }, key_attribute: 'sku', attributes: [] }],
          attributes: [],
          structures: [],
        })
      }
      if (url.pathname === '/v1/assortments' && method === 'GET') {
        return Response.json({ assortments: docs })
      }
      if (url.pathname === '/v1/assortments/a1' && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        writes.push({ method, body })
        docs = docs.map((item) => ({ ...item, name: body.name, query: { filter: body.query } }))
        return Response.json(docs[0])
      }
      if (url.pathname === '/v1/search') {
        const filter = url.searchParams.get('filter') ?? ''
        searches.push(filter)
        const hits = filter.includes('a_labels:=organic_eu')
          ? [{ id: 'o1', key: 'O-1', display_name: 'Organic cheese' }]
          : [{ id: 'c1', key: 'C-1', display_name: 'Cheese' }]
        return Response.json({ found: hits.length, hits })
      }
      return Response.json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('dynamic selection recalculation', () => {
  it('re-runs the stored query after an edit instead of showing the old result', async () => {
    render(<Harness />)
    const row = await screen.findByTestId('assortment-row')
    fireEvent.click(within(row).getByRole('button', { name: 'Cheese' }))

    await waitFor(() => expect(screen.getByTestId('assortment-open').textContent).toContain('Cheese'))
    await waitFor(() => expect(searches.some((filter) => filter.includes('groups:=food:cheese'))).toBe(true))
    expect(searches.some((filter) => filter.includes('a_labels:=organic_eu'))).toBe(false)

    act(() => requestEditSelection(docs[0]))
    await screen.findByTestId('selection-detail')
    fireEvent.change(screen.getByTestId('selection-query'), {
      target: { value: 'type_key:=product && groups:=food:cheese && a_labels:=organic_eu' },
    })
    fireEvent.click(screen.getByTestId('review-and-save'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].method).toBe('PUT')
    await waitFor(() => expect(
      searches.some((filter) => filter.includes('a_labels:=organic_eu')),
    ).toBe(true))
    await waitFor(() => expect(screen.getByTestId('assortment-open').textContent).toContain('Organic cheese'))
    expect(screen.getByTestId('assortment-open').textContent).not.toContain('C-1')
  })
})
