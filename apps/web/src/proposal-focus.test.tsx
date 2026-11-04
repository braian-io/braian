// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { publishProposal } from './proposal-bus'
import { useProposalFocus } from './proposal-focus'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string, init?: { params?: { path?: Record<string, string> } }) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  return { methods, use }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

const single: Json = {
  id: 'p1',
  source: 'agent',
  rows: [
    {
      id: 'r1',
      object_id: 'obj-1',
      type_key: 'article',
      status: 'pending',
      patch: { values: { name: { en: 'New' } } },
    },
  ],
}

const multi: Json = {
  id: 'p2',
  source: 'agent',
  rows: [
    { id: 'r1', object_id: 'obj-1', type_key: 'article', status: 'pending', patch: { values: {} } },
    { id: 'r2', object_id: 'obj-2', type_key: 'article', status: 'pending', patch: { values: {} } },
  ],
}

function Harness({ proposalId: initial = null, onOpen }: { proposalId?: string | null; onOpen: () => void }) {
  const [objectId, setObjectId] = useState<string | null>('old')
  const [proposalId, setProposalId] = useState<string | null>(initial)
  useProposalFocus({ proposalId, setObjectId, setProposalId }, onOpen)
  return <div data-testid="state">{`${objectId ?? ''}|${proposalId ?? ''}`}</div>
}

beforeEach(() => {
  mock.use((path) => {
    if (path === '/v1/proposals/{id}') return Promise.resolve(single)
    return Promise.resolve({})
  })
})

afterEach(() => {
  cleanup()
})

describe('proposal focus', () => {
  it('opens Detail for a published proposal that touches one object', async () => {
    const onOpen = vi.fn()
    render(<Harness onOpen={onOpen} />)

    publishProposal('p1')

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('obj-1|p1'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not open Detail for a multi-object proposal', async () => {
    const onOpen = vi.fn()
    mock.use((path) => {
      if (path === '/v1/proposals/{id}') return Promise.resolve(multi)
      return Promise.resolve({})
    })
    render(<Harness onOpen={onOpen} />)

    publishProposal('p2')

    await waitFor(() => expect(mock.methods.get).toHaveBeenCalledWith('/v1/proposals/{id}', {
      params: { path: { id: 'p2' } },
    }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.getByTestId('state').textContent).toBe('old|')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('follows an agent proposal set on the session without a bus event', async () => {
    const onOpen = vi.fn()
    render(<Harness proposalId="p1" onOpen={onOpen} />)

    await waitFor(() => expect(screen.getByTestId('state').textContent).toBe('obj-1|p1'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
