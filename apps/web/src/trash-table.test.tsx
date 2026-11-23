// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runCommand } from './command-registry'
import { objectQueryGone, markObjectGone } from './object-gone'
import { TrashTable } from './trash-table'

const get = vi.fn()
const post = vi.fn()

vi.mock('./api', () => ({
  api: {
    get: (...args: unknown[]) => get(...args),
    post: (...args: unknown[]) => post(...args),
  },
}))

vi.mock('sonner', () => ({ toast: vi.fn() }))

afterEach(() => {
  cleanup()
  get.mockReset()
  post.mockReset()
})

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <TrashTable />
    </QueryClientProvider>,
  )
  return client
}

describe('TrashTable', () => {
  it('lists a deleted workspace row', async () => {
    get.mockResolvedValue({
      items: [{
        kind: 'workspace',
        id: 'ws-1',
        label: 'Season',
        number: '',
        type_key: '',
        deleted_at: '2026-11-01T00:00:00Z',
      }],
    })
    post.mockResolvedValue(undefined)
    mount()
    expect(await screen.findByText('Season')).toBeTruthy()
    expect(screen.getByTestId('trash-table-chrome')).toBeTruthy()
    runCommand('trash:restore')
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/trash/{kind}/{id}/undelete', {
      params: { path: { kind: 'workspace', id: 'ws-1' } },
    }))
  })

  it('clears a gone object pin when an object is restored', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    markObjectGone(client, 'obj-trash')
    get.mockResolvedValue({
      items: [{
        kind: 'object',
        id: 'obj-trash',
        label: 'Bread',
        number: 'B-1',
        type_key: 'product',
        deleted_at: '2026-11-01T00:00:00Z',
      }],
    })
    post.mockResolvedValue(undefined)
    mount(client)
    expect(await screen.findByText('Bread')).toBeTruthy()
    expect(objectQueryGone(client, 'obj-trash')).toBe(true)
    runCommand('trash:restore')
    await waitFor(() => expect(objectQueryGone(client, 'obj-trash')).toBe(false))
  })
})