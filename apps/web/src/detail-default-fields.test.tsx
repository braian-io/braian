// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { resetObjectWriteState } from './object-write'
import { ObjectDetail, type PanesSession } from './panes'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  return { methods, use }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

const defs: Json = {
  languages: ['en'],
  types: [{ key: 'article', attributes: ['number', 'name', 'visible', 'hidden'] }],
  attributes: [
    { id: 'number', key: 'number', labels: { en: 'Number' }, kind: { type: 'text' } },
    { id: 'name', key: 'name', labels: { en: 'Name' }, kind: { type: 'text' }, language_dependent: true },
    { id: 'visible', key: 'visible', labels: { en: 'Visible' }, kind: { type: 'text' } },
    { id: 'hidden', key: 'hidden', labels: { en: 'Hidden' }, kind: { type: 'text' }, show_by_default: false },
  ],
  value_lists: [],
  unit_families: [],
  structures: [],
}

const object: Json = {
  id: 'obj-1',
  key: 'ART-1',
  type: 'article',
  version: 1,
  values: { number: 'ART-1', name: { en: 'Demo' }, visible: 'Shown', hidden: 'Secret' },
  links: [],
}

function Host() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session: PanesSession = {
    group: null,
    objectId: 'obj-1',
    proposalId: null,
    language: 'en',
    setGroup: () => undefined,
    setObjectId: () => undefined,
    setProposalId: () => undefined,
    push: () => undefined,
  }
  return (
    <QueryClientProvider client={client}>
      <ObjectDetail session={session} />
    </QueryClientProvider>
  )
}

function detailApi(path: string) {
  if (path === '/v1/objects/{id}') return Promise.resolve(object)
  if (path === '/v1/definitions') return Promise.resolve(defs)
  if (path === '/v1/proposals') return Promise.resolve({ proposals: [] })
  return Promise.resolve({})
}

beforeEach(() => {
  resetObjectWriteState()
  mock.use(detailApi)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ owners: {}, origin: null })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Detail default fields', () => {
  it('hides show_by_default false fields until Show more fields is expanded', async () => {
    render(<Host />)

    expect(await screen.findByText('Visible')).toBeTruthy()
    expect(screen.queryByText('Hidden')).toBeNull()

    fireEvent.click(screen.getByTestId('detail-show-more-fields'))

    expect(await screen.findByText('Hidden')).toBeTruthy()
    expect(screen.getByText('Show fewer fields')).toBeTruthy()
  })

  it('has no Show more control when every field is shown by default', async () => {
    const shown = {
      ...defs,
      attributes: (defs.attributes as Json[]).map((item) => (
        item.key === 'hidden' ? { ...item, show_by_default: true } : item
      )),
    }
    mock.use((path: string) => (path === '/v1/definitions' ? Promise.resolve(shown) : detailApi(path)))
    render(<Host />)

    expect(await screen.findByText('Hidden')).toBeTruthy()
    expect(screen.queryByTestId('detail-show-more-fields')).toBeNull()
  })
})
