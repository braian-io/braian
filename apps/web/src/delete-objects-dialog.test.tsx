// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DeleteObjectsHost } from './delete-objects-dialog'
import { requestDeleteObjects } from './delete-objects'

const mock = vi.hoisted(() => {
  const get = vi.fn()
  const del = vi.fn()
  return { get, del }
})

vi.mock('./api', () => ({
  api: {
    get: (...args: unknown[]) => mock.get(...args),
    delete: (...args: unknown[]) => mock.del(...args),
  },
}))

type Init = { params?: { path?: { id?: string }; query?: { dry_run?: boolean } } }

function dryRun(id: string, objects = 1, links = 1) {
  return {
    objects,
    links,
    sentence: `Removes ${objects} objects and ${links} links`,
    detail: [`Removes ${objects} objects and ${links} links`],
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <DeleteObjectsHost />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  mock.get.mockReset()
  mock.del.mockReset()
})

describe('delete object dialog', () => {
  it('shows dry-run counts with Cancel focused and writes nothing on Escape', async () => {
    mock.get.mockImplementation((path: string) => Promise.resolve({
      id: path.split('/').pop(),
      links: [{ direction: 'out', links: [{ id: 'link-1' }] }],
    }))
    mock.del.mockImplementation((_path: string, init?: Init) => Promise.resolve(
      init?.params?.query?.dry_run ? dryRun('a') : undefined,
    ))
    mount()
    act(() => requestDeleteObjects(['a']))

    expect((await screen.findByTestId('delete-object-counts')).textContent).toContain('Removes 1 object and 1 link')
    expect(screen.getByTestId('delete-object-counts').textContent?.match(/Removes/g)?.length).toBe(1)
    const cancel = screen.getByTestId('cancel-delete-object')
    expect(document.activeElement).toBe(cancel)
    fireEvent.keyDown(screen.getByTestId('delete-object-dialog'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('delete-object-dialog')).toBeNull())
    const writes = mock.del.mock.calls.filter(([, init]) => !(init as Init | undefined)?.params?.query?.dry_run)
    expect(writes).toEqual([])
  })

  it('deletes marked rows one request each after one confirm', async () => {
    mock.get.mockImplementation((path: string) => Promise.resolve({
      id: path.split('/').pop(),
      links: [{ direction: 'out', links: [{ id: 'link-1' }] }],
    }))
    mock.del.mockImplementation((path: string, init?: Init) => Promise.resolve(
      init?.params?.query?.dry_run
        ? dryRun(init?.params?.path?.id ?? '')
        : { path },
    ))
    mount()
    act(() => requestDeleteObjects(['a', 'b']))

    const counts = await screen.findByTestId('delete-object-counts')
    expect(counts.textContent).toContain('Removes 2 objects and 1 link')
    expect(counts.textContent?.match(/Removes/g)?.length).toBe(1)
    fireEvent.click(screen.getByTestId('confirm-delete-object'))

    await waitFor(() => {
      const writes = mock.del.mock.calls.filter(([, init]) => !(init as Init | undefined)?.params?.query?.dry_run)
      expect(writes).toHaveLength(2)
    })
    expect(mock.del).toHaveBeenCalledWith('/v1/objects/{id}', { params: { path: { id: 'a' } } })
    expect(mock.del).toHaveBeenCalledWith('/v1/objects/{id}', { params: { path: { id: 'b' } } })
    await waitFor(() => expect(screen.queryByTestId('delete-object-dialog')).toBeNull())
  })

  it('stops on the first failed delete and keeps the dialog honest', async () => {
    mock.get.mockImplementation((path: string) => Promise.resolve({
      id: path.split('/').pop(),
      links: [],
    }))
    mock.del.mockImplementation((_path: string, init?: Init) => {
      if (init?.params?.query?.dry_run) return Promise.resolve(dryRun('a', 1, 0))
      if (init?.params?.path?.id === 'b') return Promise.reject(new Error('Server said no'))
      return Promise.resolve({})
    })
    mount()
    act(() => requestDeleteObjects(['a', 'b']))
    await screen.findByTestId('delete-object-counts')

    fireEvent.click(screen.getByTestId('confirm-delete-object'))
    expect((await screen.findByTestId('delete-object-error')).textContent).toContain('Server said no')
    expect(screen.getByTestId('delete-object-dialog')).toBeTruthy()
    const writes = mock.del.mock.calls
      .filter(([, init]) => !(init as Init | undefined)?.params?.query?.dry_run)
      .map(([, init]) => (init as Init).params?.path?.id)
    expect(writes).toEqual(['a', 'b'])
  })
})
