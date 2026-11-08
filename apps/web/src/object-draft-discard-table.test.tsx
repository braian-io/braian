// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { ObjectTable, type PanesSession } from './panes'

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

const NAME_ID = '018f0000-0000-7000-8000-000000000101'

const definitions: Json = {
  languages: ['en'],
  types: [
    {
      id: 'type-article',
      key: 'article',
      labels: { en: 'Article' },
      singular: { en: 'Article' },
      plural: { en: 'Articles' },
      key_attribute: 'name',
      attributes: [NAME_ID],
    },
  ],
  attributes: [
    {
      id: NAME_ID,
      key: 'name',
      labels: { en: 'Name' },
      kind: { type: 'text' },
      language_dependent: true,
      multiple: false,
    },
  ],
  value_lists: [],
  unit_families: [],
  structures: [],
}

const hits = {
  found: 2,
  page: 1,
  hits: ['Zero', 'One'].map((name, index) => ({
    document: {
      id: `id-${index}`,
      key: `ART-${index}`,
      type_key: 'article',
      version: '1',
      a_name__en: name,
    },
  })),
}

let proposalBody: Json = { id: 'p1', title: 'Agent proposal', status: 'open', rows: [] }

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function TableHarness() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId: null,
      proposalId: null,
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ObjectTable
        session={session}
        view={{
          id: 'table',
          type: 'object_table',
          title: 'Articles',
          state: { type_key: 'article', table: { order: ['name'] } },
        }}
        workspace={{ id: 'ws' }}
      />
    </QueryClientProvider>
  )
}

function updateRow(objectId: string, name: string, rowId: string): Json {
  return {
    id: rowId,
    object_id: objectId,
    object_key: objectId.toUpperCase(),
    type_key: 'article',
    base_version: 1,
    status: 'pending',
    conflict: false,
    patch: { values: { name: { en: name } } },
  }
}

function discardPosts() {
  return vi.mocked(fetch).mock.calls.filter(
    ([input, init]) =>
      String(input).includes('/discard') && String(init?.method ?? '').toUpperCase() === 'POST',
  )
}

async function discardFromTable(body: Json) {
  proposalBody = body
  render(<TableHarness />)
  await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(2))
  const button = await screen.findByTestId('discard-draft')
  fireEvent.click(button)
  // Let the async discard settle before asserting it did not close the proposal.
  await new Promise((done) => setTimeout(done, 0))
}

beforeEach(() => {
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
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = (init?.method ?? 'GET').toUpperCase()
      if (method === 'POST' && url.includes('/discard')) return json({})
      if (/\/v1\/proposals\/[^/?]+$/.test(url)) return json(proposalBody)
      if (url.includes('/v1/proposals')) return json({ proposals: [{ id: 'p1', title: 'Agent proposal', status: 'open' }] })
      if (url.includes('/v1/search')) return json(hits)
      if (url.includes('/v1/definitions')) return json(definitions)
      if (url.includes('/column-prefs')) return json({ document: null })
      if (url.includes('/attribute-paths')) return json({ paths: [], system_columns: [] })
      if (url.includes('/v1/assortments')) return json({ assortments: [] })
      if (url.includes('/v1/frecency')) return json({ entries: {} })
      if (url.includes('/v1/me')) return json({ kind: 'human', role: 'editor' })
      return json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ObjectTable discard scope', () => {
  it('discards a proposal whose complete membership is the visible row', async () => {
    await discardFromTable({
      id: 'p1',
      title: 'Agent proposal',
      status: 'open',
      rows: [updateRow('id-0', 'New', 'r1')],
    })
    expect(discardPosts()).toHaveLength(1)
    expect(String(discardPosts()[0]?.[0])).toContain('/v1/proposals/p1/discard')
  })

  it('keeps a proposal that also changes a hidden object', async () => {
    await discardFromTable({
      id: 'p1',
      title: 'Agent proposal',
      status: 'open',
      rows: [updateRow('id-0', 'New', 'r1'), updateRow('hidden-99', 'Hidden', 'r2')],
    })
    expect(discardPosts()).toHaveLength(0)
  })

  it('keeps a proposal with a visible update and a create row', async () => {
    await discardFromTable({
      id: 'p1',
      title: 'Agent proposal',
      status: 'open',
      rows: [
        updateRow('id-0', 'New', 'r1'),
        { id: 'r2', type_key: 'article', status: 'pending', patch: { values: { name: { en: 'Created' } } } },
      ],
    })
    expect(discardPosts()).toHaveLength(0)
  })

  it('keeps a proposal with a visible update and a delete row', async () => {
    await discardFromTable({
      id: 'p1',
      title: 'Agent proposal',
      status: 'open',
      rows: [
        updateRow('id-0', 'New', 'r1'),
        { id: 'r2', object_id: 'id-0', type_key: 'article', status: 'pending', patch: { op: 'delete' } },
      ],
    })
    expect(discardPosts()).toHaveLength(0)
  })

  it('keeps a proposal with a visible update and a model row', async () => {
    await discardFromTable({
      id: 'p1',
      title: 'Agent proposal',
      status: 'open',
      rows: [
        updateRow('id-0', 'New', 'r1'),
        { id: 'r2', type_key: 'model', status: 'pending', patch: { op: 'add_attribute' } },
      ],
    })
    expect(discardPosts()).toHaveLength(0)
  })

  it('keeps a hidden create/delete/model proposal visible in the review path', async () => {
    proposalBody = {
      id: 'p1',
      title: 'Agent proposal',
      status: 'open',
      rows: [{ id: 'r2', type_key: 'model', status: 'pending', patch: { op: 'add_attribute' } }],
    }
    render(<TableHarness />)
    await waitFor(() => expect(screen.getAllByTestId('object-row')).toHaveLength(2))
    expect(await screen.findByTestId('review-unmapped-p1')).toBeTruthy()
    expect(discardPosts()).toHaveLength(0)
  })
})
