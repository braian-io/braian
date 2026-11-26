// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestDeleteSelection } from './assortment-filter'
import { SelectionHost } from './assortments'
import { ObjectTable, type PanesSession } from './panes'

const product = '018f0000-0000-7000-8000-000000000200'
const article = '018f0000-0000-7000-8000-000000000201'

type Selection = {
  id: string
  name: string
  type: string
  type_id: string
  kind?: string
  query: Record<string, unknown>
}

let selections: Selection[] = []

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function ProductsTable({ queryClient }: { queryClient?: QueryClient } = {}) {
  const [fallbackClient] = useState(client)
  const [group, setGroup] = useState<string | null>(null)
  const session = useMemo<PanesSession>(
    () => ({
      group,
      objectId: null,
      proposalId: null,
      language: 'en',
      listType: 'product',
      setGroup,
      setListType: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [group],
  )
  return (
    <QueryClientProvider client={queryClient ?? fallbackClient}>
      <ObjectTable
        session={session}
        view={{
          id: 'table',
          type: 'object_table',
          title: 'Products',
          state: { object_type: product, type_key: 'product' },
        }}
        workspace={{ id: 'ws' }}
      />
      <SelectionHost session={session} />
    </QueryClientProvider>
  )
}

function searchFilterOf(input: RequestInfo | URL) {
  return decodeURIComponent(new URL(String(input), 'http://local').searchParams.get('filter') ?? '')
}

beforeEach(() => {
  selections = [
    { id: 'a3', name: 'Cheese', type: 'product', type_id: product, query: { group: 'food:cheese' } },
    { id: 'a1', name: 'Cheese', type: 'article', type_id: article, query: { group: 'food:cheese' } },
    { id: 'a2', name: 'Organic', type: 'article', type_id: article, query: { labels: 'organic_eu' } },
  ]
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? 'GET').toUpperCase()
      if (url.includes('/v1/definitions')) {
        return Response.json({
          languages: ['en'],
          types: [
            { id: product, key: 'product', labels: { en: 'Product' }, singular: { en: 'Product' }, plural: { en: 'Products' }, key_attribute: 'sku', attributes: [] },
            { id: article, key: 'article', labels: { en: 'Article' }, singular: { en: 'Article' }, plural: { en: 'Articles' }, key_attribute: 'sku', attributes: [] },
          ],
          attributes: [],
          structures: [],
        })
      }
      const usage = url.match(/\/v1\/assortments\/([^/?]+)\/usage/)
      if (usage) return Response.json({ views: [], job_types: [], webhooks: [] })
      const remove = url.match(/\/v1\/assortments\/([^/?]+)$/)
      if (remove && method === 'DELETE') {
        selections = selections.filter((item) => item.id !== remove[1])
        return Response.json({ ok: true })
      }
      if (url.includes('/v1/assortments')) {
        return Response.json({ assortments: selections })
      }
      if (url.includes('/v1/search')) return Response.json({ found: 0, hits: [] })
      return Response.json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('product selections', () => {
  it('lists only selections of the product type', async () => {
    render(<ProductsTable />)
    await waitFor(() => expect(screen.getAllByTestId('assortment').length).toBeGreaterThan(0))
    const chips = screen.getAllByTestId('assortment')
    expect(chips.every((chip) => chip.textContent === 'Cheese')).toBe(true)
    expect(screen.queryByText('Organic')).toBeNull()
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('type=product'))).toBe(true)
  })

  it('falls back to All at once when the active chip is deleted, and scopes the usage text', async () => {
    render(<ProductsTable />)
    const chip = await screen.findByTestId('assortment')
    fireEvent.click(chip)
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'))
    const filters = screen.getByTestId('standard-table-filters')
    expect(within(filters).getByRole('button', { name: 'All' }).classList.contains('on')).toBe(false)

    act(() => requestDeleteSelection(selections[0]))
    const dialog = await screen.findByTestId('delete-selection')
    await waitFor(() => {
      const usage = within(dialog).getByTestId('selection-usage').textContent ?? ''
      expect(usage).toContain('Not used by a saved view, job, or webhook.')
      expect(usage).not.toContain('Not used anywhere.')
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByTestId('assortment')).toBeNull())
    await waitFor(() => expect(within(filters).getByRole('button', { name: 'All' }).classList.contains('on')).toBe(true))
    const lastSearch = vi.mocked(fetch).mock.calls
      .filter(([input]) => String(input).includes('/v1/search'))
      .at(-1)
    expect(lastSearch).toBeTruthy()
    expect(searchFilterOf(lastSearch![0])).not.toContain('groups:=')
  })

  it('applies an empty manual selection as a filter that matches nothing', async () => {
    selections = [{ id: 'm1', name: 'Empty manual', type: 'product', type_id: product, kind: 'manual', query: {} }]
    render(<ProductsTable />)
    const chip = await screen.findByTestId('assortment')
    fireEvent.click(chip)
    await waitFor(() => expect(chip.getAttribute('aria-pressed')).toBe('true'))
    await waitFor(() => {
      const searches = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes('/v1/search'))
      expect(searches.some(([input]) => searchFilterOf(input).includes('id:=__braian_empty_manual__'))).toBe(true)
    })
    const filters = screen.getByTestId('standard-table-filters')
    expect(within(filters).getByRole('button', { name: 'All' }).classList.contains('on')).toBe(false)
  })
})
