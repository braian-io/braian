// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from './i18n'
import { LIST_PREVIEW, OBJECT_NAV_DEBOUNCE_MS, OBJECT_PREFETCH_RADIUS } from './object-list-preview'
import {
  markObjectNavReplace,
  OBJECT_LAND_IMMEDIATE,
  objectNavReplaceId,
  resetObjectNavReplace,
} from './object-nav-signal'
import { ObjectDetail, ObjectTable, type PanesSession } from './panes'

const { scrollToIndex } = vi.hoisted(() => ({ scrollToIndex: vi.fn() }))

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
    scrollToIndex,
  }),
}))

const rowCount = 30

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function searchBody() {
  return {
    found: rowCount,
    hits: Array.from({ length: rowCount }, (_, index) => ({
      document: {
        id: `id-${index}`,
        key: `ART-${index}`,
        type_key: 'article',
        version: '1',
        a_name__en: `Row ${index}`,
        a_status: 'ok',
      },
    })),
  }
}

function TableHarness({ client }: { client: QueryClient }) {
  const [objectId, setObjectId] = useState<string | null>(null)
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId,
      proposalId: null,
      language: 'en',
      setGroup: () => undefined,
      setObjectId,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [objectId],
  )
  return (
    <QueryClientProvider client={client}>
      <ObjectTable
        session={session}
        view={{ id: 'table', type: 'object_table', title: 'Objects', state: {} }}
        workspace={{ id: 'ws' }}
      />
    </QueryClientProvider>
  )
}

function grid() {
  const node = document.querySelector('.grid')
  if (!(node instanceof HTMLElement)) throw new Error('missing grid')
  return node
}

function installPrefetchCounter(client: QueryClient) {
  const batches: number[] = []
  let open = false
  vi.spyOn(client, 'prefetchQuery').mockImplementation((options) => {
    const key = (options as { queryKey?: unknown }).queryKey
    const objectFetch = Array.isArray(key) && key[0] === 'object' && key.length === 2
    if (!objectFetch) return Promise.resolve(undefined as never)
    if (!open) {
      open = true
      batches.push(0)
      queueMicrotask(() => {
        open = false
      })
    }
    batches[batches.length - 1] += 1
    return Promise.resolve(undefined as never)
  })
  return batches
}

async function pressArrows(steps: number, gapMs: number, shift: boolean) {
  for (let step = 0; step < steps; step += 1) {
    fireEvent.keyDown(grid(), { key: 'ArrowDown', shiftKey: shift })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(gapMs)
    })
  }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(OBJECT_NAV_DEBOUNCE_MS)
  })
}

beforeEach(() => {
  resetObjectNavReplace()
  scrollToIndex.mockClear()
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
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v1/search')) {
        if (url.includes('group=groups')) return json({ groups: [] })
        return json(searchBody())
      }
      if (url.includes('/v1/definitions')) {
        return json({ types: [], attributes: [], unit_families: [], structures: [] })
      }
      if (url.includes('/v1/assortments')) return json({ assortments: [] })
      if (url.includes('/v1/frecency')) return json({ entries: {} })
      if (url.includes('/v1/me')) return json({ user_id: 'user' })
      if (url.includes('/v1/proposals')) return json({ proposals: [] })
      return json({})
    }),
  )
})

afterEach(() => {
  cleanup()
  resetObjectNavReplace()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('table object-nav prefetch debounce', () => {
  async function renderTable() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const batches = installPrefetchCounter(client)
    const lands: string[] = []
    const onLand = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (id) lands.push(id)
    }
    window.addEventListener(OBJECT_LAND_IMMEDIATE, onLand)
    render(<TableHarness client={client} />)
    await waitFor(() => expect(screen.getAllByTestId('object-row').length).toBeGreaterThan(0))
    vi.useFakeTimers()
    return {
      batches,
      lands,
      stop: () => window.removeEventListener(OBJECT_LAND_IMMEDIATE, onLand),
    }
  }

  it('coalesces twenty-four arrow steps at 50ms into one prefetch batch', async () => {
    const nav = await renderTable()
    await pressArrows(24, 50, false)
    nav.stop()
    expect(nav.lands).toHaveLength(1)
    expect(nav.batches).toHaveLength(1)
    expect(nav.batches[0]).toBeLessThanOrEqual(OBJECT_PREFETCH_RADIUS * 2 + 1)
    expect(nav.batches[0]).toBeGreaterThan(0)
  })

  it('prefetches on every arrow when steps are slower than the debounce', async () => {
    const nav = await renderTable()
    await pressArrows(24, 150, false)
    nav.stop()
    expect(nav.lands).toHaveLength(24)
    expect(nav.batches).toHaveLength(24)
    for (const size of nav.batches) expect(size).toBeLessThanOrEqual(OBJECT_PREFETCH_RADIUS * 2 + 1)
  })

  it('debounces Shift+Arrow the same way as a plain arrow', async () => {
    const nav = await renderTable()
    await pressArrows(24, 50, true)
    nav.stop()
    expect(nav.lands).toHaveLength(1)
    expect(nav.batches).toHaveLength(1)
    expect(nav.batches[0]).toBeLessThanOrEqual(OBJECT_PREFETCH_RADIUS * 2 + 1)
  })
})

describe('arrow replace flag from the table', () => {
  async function renderTable() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<TableHarness client={client} />)
    await waitFor(() => expect(screen.getAllByTestId('object-row').length).toBeGreaterThan(0))
    vi.useFakeTimers()
  }

  it('drops the replace mark when an arrow burst returns to its start', async () => {
    await renderTable()
    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OBJECT_NAV_DEBOUNCE_MS)
    })
    expect(objectNavReplaceId()).toBe('id-0')

    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    fireEvent.keyDown(grid(), { key: 'ArrowUp' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OBJECT_NAV_DEBOUNCE_MS)
    })
    expect(objectNavReplaceId()).toBeNull()
  })

  it('keeps the replace mark for a one-way arrow and clears it on click', async () => {
    await renderTable()
    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OBJECT_NAV_DEBOUNCE_MS)
    })
    fireEvent.keyDown(grid(), { key: 'ArrowDown' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OBJECT_NAV_DEBOUNCE_MS)
    })
    expect(objectNavReplaceId()).toBe('id-1')

    fireEvent.click(screen.getAllByTestId('object-row')[0]!)
    expect(objectNavReplaceId()).toBeNull()
  })
})

describe('failed Detail load', () => {
  function DetailHost({ client }: { client: QueryClient }) {
    const session = useMemo<PanesSession>(
      () => ({
        group: null,
        objectId: 'obj-1',
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
      <QueryClientProvider client={client}>
        <ObjectDetail session={session} />
      </QueryClientProvider>
    )
  }

  function failingClient() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['object', 'obj-1'], {
      id: 'obj-1',
      key: 'ART-1',
      type: 'article',
      version: 0,
      values: { number: 'ART-1' },
      links: [],
      [LIST_PREVIEW]: true,
    })
    return client
  }

  function stubObjectFetch(mode: { current: 'fail' | 'hang' | 'ok' }, hang: Promise<void>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/objects/')) {
          if (mode.current === 'fail') return json({ detail: 'forced load failure' }, 500)
          if (mode.current === 'hang') await hang
          return json({
            id: 'obj-1',
            key: 'ART-1',
            type: 'article',
            version: 1,
            values: { number: 'ART-1', name: { en: 'Loaded' } },
            links: [],
          })
        }
        if (url.includes('/v1/definitions')) {
          return json({ languages: ['en'], types: [], attributes: [], value_lists: [], unit_families: [], structures: [] })
        }
        if (url.includes('/v1/proposals')) return json({ proposals: [] })
        if (url.includes('/v1/me')) return json({ user_id: 'user' })
        return json({})
      }),
    )
  }

  it('does not clear a replace mark for a different object when this load fails', async () => {
    const mode = { current: 'fail' as const }
    stubObjectFetch(mode, Promise.resolve())
    markObjectNavReplace('other-object')
    vi.useFakeTimers()
    render(<DetailHost client={failingClient()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(screen.getByTestId('detail-fetch-retry')).toBeTruthy()
    expect(objectNavReplaceId()).toBe('other-object')
  })

  it('clears the arrow replace mark and shows a busy Retry while refetching', async () => {
    let releaseHang = () => {}
    const hang = new Promise<void>((resolve) => {
      releaseHang = resolve
    })
    const mode: { current: 'fail' | 'hang' | 'ok' } = { current: 'fail' }
    stubObjectFetch(mode, hang)
    markObjectNavReplace('obj-1')
    vi.useFakeTimers()
    render(<DetailHost client={failingClient()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    const retry = screen.getByTestId('detail-fetch-retry')
    expect(objectNavReplaceId()).toBeNull()
    expect(retry.getAttribute('aria-busy')).not.toBe('true')
    expect((retry as HTMLButtonElement).disabled).toBe(false)

    mode.current = 'hang'
    fireEvent.click(retry)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const busy = screen.getByTestId('detail-fetch-retry')
    expect(busy.getAttribute('aria-busy')).toBe('true')
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    expect(busy.textContent).toBe(copy.loading)

    mode.current = 'ok'
    releaseHang()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    vi.useRealTimers()
    await waitFor(() => expect(screen.getByTestId('object-detail')).toBeTruthy())
    expect(screen.queryByTestId('detail-error')).toBeNull()
  })
})
