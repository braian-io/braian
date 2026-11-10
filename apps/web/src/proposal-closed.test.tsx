// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { ProposalView, type PanesSession } from './panes'

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

let proposal: Json

function Host() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId: null,
      proposalId: 'p1',
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={client}>
      <ProposalView session={session} />
    </QueryClientProvider>
  )
}

function row(id: string, status: string) {
  return {
    id,
    object_id: `obj-${id}`,
    type_key: 'item',
    status,
    patch: { values: { name: { en: 'New' } } },
  }
}

function disabled(testId: string) {
  return (screen.getByTestId(testId) as HTMLButtonElement).disabled
}

beforeEach(() => {
  mock.use((path: string) => {
    if (path === '/v1/proposals') return Promise.resolve({ proposals: [proposal] })
    if (path === '/v1/proposals/{id}') return Promise.resolve(proposal)
    if (path === '/v1/definitions') return Promise.resolve({ languages: ['en'], types: [], attributes: [], structures: [] })
    return Promise.resolve({})
  })
})

afterEach(() => {
  cleanup()
})

describe('closed proposal bulk actions', () => {
  it('disables Save all and Discard all on an accepted proposal', async () => {
    proposal = { id: 'p1', title: 'Accepted', status: 'accepted', rows: [row('r1', 'accepted')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    expect(disabled('save-all')).toBe(true)
    expect(disabled('discard-all')).toBe(true)
  })

  it('disables Save all and Discard all on a discarded proposal', async () => {
    proposal = { id: 'p1', title: 'Discarded', status: 'discarded', rows: [row('r1', 'rejected')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    expect(disabled('save-all')).toBe(true)
    expect(disabled('discard-all')).toBe(true)
  })

  it('disables Save all and Discard all on a closed proposal with accepted and rejected rows', async () => {
    proposal = {
      id: 'p1',
      title: 'Mixed',
      status: 'accepted',
      rows: [row('r1', 'accepted'), row('r2', 'rejected')],
    }
    render(<Host />)
    await screen.findByTestId('save-all')
    expect(disabled('save-all')).toBe(true)
    expect(disabled('discard-all')).toBe(true)
  })

  it('keeps Save all and Discard all enabled while a row is pending', async () => {
    proposal = { id: 'p1', title: 'Open', status: 'open', rows: [row('r1', 'pending')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('save-all')).toBe(false))
    expect(disabled('discard-all')).toBe(false)
  })
})
