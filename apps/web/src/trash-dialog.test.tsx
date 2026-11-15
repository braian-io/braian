// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { objectQueryGone, markObjectGone } from './object-gone'
import { TrashDialog } from './trash-dialog'

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
      <TrashDialog open onClose={() => {}} />
    </QueryClientProvider>,
  )
  return client
}

describe('TrashDialog', () => {
  it('lists a deleted workspace and restores it', async () => {
    get.mockResolvedValue({
      items: [{ kind: 'workspace', id: 'ws-1', label: 'Season', deleted_at: '2026-11-01T00:00:00Z' }],
    })
    post.mockResolvedValue(undefined)
    mount()
    expect(await screen.findByText('Season')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(post).toHaveBeenCalledWith('/v1/trash/{kind}/{id}/undelete', {
      params: { path: { kind: 'workspace', id: 'ws-1' } },
    }))
  })

  it('clears a gone object pin when an object is restored', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    markObjectGone(client, 'obj-trash')
    get.mockResolvedValue({
      items: [{ kind: 'object', id: 'obj-trash', label: 'Bread', deleted_at: '2026-11-01T00:00:00Z' }],
    })
    post.mockResolvedValue(undefined)
    mount(client)
    expect(await screen.findByText('Bread')).toBeTruthy()
    expect(objectQueryGone(client, 'obj-trash')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(objectQueryGone(client, 'obj-trash')).toBe(false))
  })
})
