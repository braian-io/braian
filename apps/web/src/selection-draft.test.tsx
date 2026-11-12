// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AssortmentList, SelectionHost } from './assortments'
import {
  requestDeleteSelection,
  requestEditSelection,
  requestNewSelection,
} from './assortment-filter'

const product = '018f0000-0000-7000-8000-000000000200'
const article = '018f0000-0000-7000-8000-000000000201'

type Doc = Record<string, unknown>
type Write = { method: string; path: string; body: Record<string, unknown> }

let docs: Doc[] = []
let writes: Write[] = []
let usage: unknown = { views: [] }

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function normalize(query: unknown): unknown {
  return typeof query === 'string' ? { filter: query } : (query ?? {})
}

function Harness() {
  const [queryClient] = useState(client)
  const session = useMemo(
    () => ({
      group: 'food:cheese',
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

function definitions() {
  return {
    languages: ['en'],
    types: [
      { id: product, key: 'product', labels: { en: 'Product' }, singular: { en: 'Product' }, plural: { en: 'Products' }, key_attribute: 'sku', attributes: [] },
      { id: article, key: 'article', labels: { en: 'Article' }, singular: { en: 'Article' }, plural: { en: 'Articles' }, key_attribute: 'sku', attributes: [] },
    ],
    attributes: [],
    structures: [],
  }
}

beforeEach(() => {
  docs = []
  writes = []
  usage = { views: [] }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'http://local')
      const method = String(init?.method ?? 'GET').toUpperCase()
      if (url.pathname === '/v1/definitions') return Response.json(definitions())
      if (url.pathname === '/v1/assortments' && method === 'GET') {
        return Response.json({ assortments: docs })
      }
      if (url.pathname === '/v1/assortments' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        writes.push({ method, path: url.pathname, body })
        const created: Doc = {
          id: `new-${docs.length + 1}`,
          name: body.name,
          kind: body.kind ?? 'manual',
          type: body.type ?? 'product',
          type_id: product,
          query: normalize(body.query),
        }
        docs = [...docs, created]
        return Response.json(created)
      }
      const update = url.pathname.match(/^\/v1\/assortments\/([^/]+)$/)
      if (update && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
        writes.push({ method, path: url.pathname, body })
        docs = docs.map((item) => (String(item.id) === update[1]
          ? { ...item, name: body.name, query: normalize(body.query) }
          : item))
        return Response.json(docs.find((item) => String(item.id) === update[1]) ?? {})
      }
      const usagePath = url.pathname.match(/^\/v1\/assortments\/([^/]+)\/usage$/)
      if (usagePath) return Response.json(usage)
      if (url.pathname === '/v1/search') return Response.json({ found: 0, hits: [] })
      return Response.json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('selection drafts', () => {
  it('creates nothing until Save, then lists the new selection', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('new-selection-button'))
    const detail = await screen.findByTestId('selection-detail')
    expect(within(detail).getByText('New selection')).toBeTruthy()

    fireEvent.change(screen.getByTestId('assortment-name'), { target: { value: 'Fresh cheese' } })
    fireEvent.change(screen.getByTestId('selection-kind'), { target: { value: 'dynamic' } })
    fireEvent.change(screen.getByTestId('selection-query'), {
      target: { value: 'type_key:=product && groups:=food:cheese' },
    })
    expect(writes).toHaveLength(0)
    expect(docs).toHaveLength(0)

    fireEvent.click(screen.getByTestId('discard-draft'))
    await waitFor(() => expect(screen.queryByTestId('selection-detail')).toBeNull())
    expect(writes).toHaveLength(0)
    expect(docs).toHaveLength(0)

    fireEvent.click(screen.getByTestId('new-selection-button'))
    await screen.findByTestId('selection-detail')
    fireEvent.change(screen.getByTestId('assortment-name'), { target: { value: 'Fresh cheese' } })
    fireEvent.change(screen.getByTestId('selection-kind'), { target: { value: 'dynamic' } })
    fireEvent.change(screen.getByTestId('selection-query'), {
      target: { value: 'type_key:=product && groups:=food:cheese' },
    })
    expect(writes).toHaveLength(0)
    fireEvent.click(screen.getByTestId('review-and-save'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].method).toBe('POST')
    expect(writes[0].path).toBe('/v1/assortments')
    expect(writes[0].body).toMatchObject({
      name: 'Fresh cheese',
      type: 'product',
      kind: 'dynamic',
      query: 'type_key:=product && groups:=food:cheese',
    })
    await waitFor(() => expect(screen.getByTestId('assortment-row').textContent).toContain('Fresh cheese'))
  })

  it('edits in Detail and only PUTs on Save; Discard and Escape write nothing', async () => {
    docs = [{
      id: 'a1',
      name: 'Cheese',
      type: 'product',
      type_id: product,
      kind: 'dynamic',
      query: { filter: 'type_key:=product && groups:=food:cheese' },
    }]
    render(<Harness />)
    await waitFor(() => expect(screen.getByTestId('assortment-row').textContent).toContain('Cheese'))

    act(() => requestEditSelection(docs[0]))
    const detail = await screen.findByTestId('selection-detail')
    expect(within(detail).getByText('Edit selection')).toBeTruthy()
    expect(screen.getByTestId('selection-type').getAttribute('data-locked')).toBe('true')
    expect(screen.getByTestId('selection-kind').getAttribute('data-locked')).toBe('true')
    expect(within(detail).queryByRole('combobox')).toBeNull()

    fireEvent.change(screen.getByTestId('assortment-name'), { target: { value: 'Aged cheese' } })
    fireEvent.change(screen.getByTestId('selection-query'), {
      target: { value: 'type_key:=product && groups:=food:cheese && a_labels:=organic_eu' },
    })
    expect(writes).toHaveLength(0)
    fireEvent.click(screen.getByTestId('discard-draft'))
    await waitFor(() => expect(screen.queryByTestId('selection-detail')).toBeNull())
    expect(writes).toHaveLength(0)
    expect(screen.getByTestId('assortment-row').textContent).toContain('Cheese')

    act(() => requestEditSelection(docs[0]))
    await screen.findByTestId('selection-detail')
    fireEvent.change(screen.getByTestId('assortment-name'), { target: { value: 'Aged cheese' } })
    fireEvent.change(screen.getByTestId('selection-query'), {
      target: { value: 'type_key:=product && groups:=food:cheese && a_labels:=organic_eu' },
    })
    fireEvent.click(screen.getByTestId('review-and-save'))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].method).toBe('PUT')
    expect(writes[0].path).toBe('/v1/assortments/a1')
    expect(writes[0].body).toMatchObject({
      id: 'a1',
      name: 'Aged cheese',
      kind: 'dynamic',
      query: 'type_key:=product && groups:=food:cheese && a_labels:=organic_eu',
    })
    await waitFor(() => expect(screen.getByTestId('assortment-row').textContent).toContain('Aged cheese'))

    act(() => requestEditSelection(docs[0]))
    await screen.findByTestId('selection-detail')
    fireEvent.change(screen.getByTestId('assortment-name'), { target: { value: 'Never saved' } })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('selection-detail')).toBeNull())
    expect(writes).toHaveLength(1)
    expect(docs[0].name).toBe('Aged cheese')
  })

  it('save filter as selection prefills a Dynamic draft and waits for Save', async () => {
    render(<Harness />)
    act(() => requestNewSelection({
      kind: 'dynamic',
      query: 'type_key:=product && groups:=food:cheese',
      type: 'product',
    }))
    await screen.findByTestId('selection-detail')
    expect((screen.getByTestId('selection-kind') as HTMLSelectElement).value).toBe('dynamic')
    expect((screen.getByTestId('selection-query') as HTMLInputElement).value).toBe('type_key:=product && groups:=food:cheese')
    expect(writes).toHaveLength(0)

    fireEvent.click(screen.getByTestId('discard-draft'))
    await waitFor(() => expect(screen.queryByTestId('selection-detail')).toBeNull())
    expect(writes).toHaveLength(0)
    expect(docs).toHaveLength(0)
  })

  it('creates a manual selection without a dynamic query and still previews delete usage', async () => {
    usage = { views: [{ id: 'v1', title: 'Products' }] }
    render(<Harness />)
    fireEvent.click(screen.getByTestId('new-selection-button'))
    await screen.findByTestId('selection-detail')
    expect(screen.queryByTestId('selection-query')).toBeNull()
    fireEvent.change(screen.getByTestId('assortment-name'), { target: { value: 'Hand picked' } })
    fireEvent.click(screen.getByTestId('review-and-save'))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].method).toBe('POST')
    expect(writes[0].body.kind).toBe('manual')
    expect(writes[0].body.query).toEqual({ group: 'food:cheese' })

    act(() => requestDeleteSelection({ id: 'new-1', name: 'Hand picked' }))
    const dialog = await screen.findByTestId('delete-selection')
    await waitFor(() => expect(within(dialog).getByTestId('selection-usage').textContent).toContain('Products'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('delete-selection')).toBeNull())
  })
})
