// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { resetObjectDrafts } from './object-draft'
import { resetObjectWriteState } from './object-write'
import { ObjectDetail, type PanesSession } from './panes'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string, init?: { body?: unknown; params?: { path?: Record<string, string> } }) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  return { methods, use }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

const NAME_ID = '018f0000-0000-7000-8000-000000000101'

const definitions: Json = {
  languages: ['en'],
  types: [{ key: 'article', attributes: [NAME_ID] }],
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

const object: Json = {
  id: 'obj-1',
  key: 'ART-1',
  type: 'article',
  version: 3,
  values: { number: 'ART-1', name: { en: 'Old' } },
  links: [],
}

const proposal: Json = {
  id: 'p1',
  title: 'Agent proposal',
  status: 'open',
  source: 'agent',
  rows: [
    {
      id: 'r1',
      object_id: 'obj-1',
      object_key: 'ART-1',
      type_key: 'article',
      base_version: 3,
      status: 'pending',
      conflict: false,
      patch: { values: { name: { en: 'New' } } },
    },
  ],
}

function Host({ proposalId = 'p1', client: provided }: { proposalId?: string | null; client?: QueryClient }) {
  const [created] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const client = provided ?? created
  const session: PanesSession = {
    group: null,
    objectId: 'obj-1',
    proposalId,
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

function proposalApi(path: string) {
  if (path === '/v1/objects/{id}') return Promise.resolve(object)
  if (path === '/v1/definitions') return Promise.resolve(definitions)
  if (path === '/v1/proposals') return Promise.resolve({
    pending: { total: 1, objects: [{ object_id: 'obj-1', count: 1 }] },
    proposals: [{ id: 'p1', title: 'Agent proposal', status: 'open' }],
  })
  if (path === '/v1/proposals/{id}') return Promise.resolve(proposal)
  if (path === '/v1/proposals/{id}/accept') return Promise.resolve({ accepted: [{ id: 'r1' }], failed: [] })
  return Promise.resolve({})
}

function acceptCall() {
  return mock.methods.post.mock.calls.find((call) => call[0] === '/v1/proposals/{id}/accept')
}

beforeEach(() => {
  resetObjectDrafts()
  resetObjectWriteState()
  mock.use(proposalApi)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ owners: {}, origin: null })))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('pending proposal values in Detail', () => {
  it('shows the proposed value as pending and accepts only that line', async () => {
    render(<Host />)

    const pending = await screen.findByTestId('pending-field')
    expect(pending.textContent).toContain('Pending')
    expect(pending.textContent).toContain('New')
    expect(pending.getAttribute('data-field')).toBe('name')

    fireEvent.click(screen.getByTestId('review-and-save'))

    await waitFor(() => expect(acceptCall()).toBeTruthy())
    expect(acceptCall()?.[1]).toMatchObject({
      params: { path: { id: 'p1' } },
      body: { rows: ['r1'] },
    })
  })

  it('shows pending values from any open proposal, not only the selected one', async () => {
    render(<Host proposalId={null} />)

    const pending = await screen.findByTestId('pending-field')
    expect(pending.textContent).toContain('New')

    fireEvent.click(screen.getByTestId('review-and-save'))

    await waitFor(() => expect(acceptCall()).toBeTruthy())
    expect(acceptCall()?.[1]).toMatchObject({
      params: { path: { id: 'p1' } },
      body: { rows: ['r1'] },
    })
  })

  it('discards the pending row instead of rejecting it from the panel', async () => {
    render(<Host />)

    await screen.findByTestId('pending-field')
    fireEvent.click(screen.getByTestId('discard-draft'))

    await waitFor(() => expect(mock.methods.post.mock.calls.some((call) => call[0] === '/v1/proposals/{id}/discard')).toBe(true))
    expect(acceptCall()).toBeUndefined()
  })
})

describe('Detail save', () => {
  it('keeps the new name after save even when a stale GET resolves', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const updated: Json = {
      ...object,
      version: 4,
      seq: 9,
      values: { number: 'ART-1', name: { en: 'New' } },
    }
    let objectGets = 0
    mock.methods.get.mockImplementation((path: string) => {
      if (path === '/v1/objects/{id}') {
        objectGets += 1
        return Promise.resolve(object)
      }
      if (path === '/v1/definitions') return Promise.resolve(definitions)
      if (path === '/v1/proposals') return Promise.resolve({ proposals: [] })
      return Promise.resolve({})
    })
    mock.methods.patch.mockImplementation(() => Promise.resolve(updated))

    render(<Host proposalId={null} client={client} />)

    const title = await waitFor(() => {
      const node = document.querySelector('.detail-title strong')
      expect(node?.textContent).toBe('Old')
      return node as HTMLElement
    })
    const editor = screen
      .getAllByDisplayValue('Old')
      .find((node) => !(node as HTMLInputElement).readOnly) as HTMLInputElement
    fireEvent.change(editor, { target: { value: 'New' } })
    expect(title.textContent).toBe('New')

    const seen: string[] = [title.textContent ?? '']
    const observer = new MutationObserver(() => {
      const text = title.textContent ?? ''
      if (seen[seen.length - 1] !== text) seen.push(text)
    })
    observer.observe(title, { childList: true, subtree: true, characterData: true })

    fireEvent.click(screen.getByTestId('review-and-save'))
    await waitFor(() => expect(mock.methods.patch).toHaveBeenCalled())
    await waitFor(() => expect(title.textContent).toBe('New'))

    const before = objectGets
    await client.invalidateQueries({ queryKey: ['object', 'obj-1'] })
    await waitFor(() => expect(objectGets).toBeGreaterThan(before))
    await waitFor(() => expect(title.textContent).toBe('New'))

    observer.disconnect()
    expect(seen).toEqual(['New'])
  })
})

describe('Detail header', () => {
  it('does not repeat the object type as a kicker above the title', async () => {
    render(<Host proposalId={null} />)

    await screen.findByTestId('object-detail')
    expect(document.querySelector('.detail-kicker')).toBeNull()
  })
})
