// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MASTER_CATALOG_ID } from './catalog-ref'
import type { ObjectKeyPage } from './url-object'
import { objectTokenFor, shortId } from './url-public'
import { useReadableUrl } from './use-readable-url'

const product = '018f0000-0000-7000-8000-0000000000aa'
const article = '018f0000-0000-7000-8000-0000000000bb'
const workspace = '018f2000-0000-7000-8000-000000000003'
const view = '018f2000-0000-7000-8000-000000000010'
const key = 'ART/Æ& +'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function catalogs() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/v1/catalogs')) {
      return new Response(JSON.stringify([
        { id: MASTER_CATALOG_ID, key: 'master', name: 'Master catalog' },
      ]))
    }
    return new Response('not found', { status: 404 })
  }))
}

function page(rows: Array<{ id: string; key: string | null }>): ObjectKeyPage {
  return { rows, complete: true }
}

function setup(
  search: Record<string, string>,
  list: (catalog: string, key: string, typeKey?: string | null) => Promise<ObjectKeyPage>,
  listById: (catalog: string, suffix: string, typeKey?: string | null) => Promise<ObjectKeyPage> =
    async () => page([]),
  extra: {
    objectTypeKey?: string | null
    viewTypeKey?: (viewId: string) => string | null
  } = {},
) {
  catalogs()
  const navigate = vi.fn()
  const applyObject = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    (props: { search: Record<string, string>; objectId: string | null; objectKey: string | null; objectLoaded: boolean }) => {
      useReadableUrl({
        search: props.search,
        ready: true,
        catalogsEnabled: true,
        workspaceId: workspace,
        workspaces: [{ id: workspace, label: 'Products' }],
        viewId: view,
        views: [{ id: view, label: 'Products' }],
        openViewIds: [view],
        catalogId: MASTER_CATALOG_ID,
        objectTypeKey: extra.objectTypeKey === undefined ? 'product' : extra.objectTypeKey,
        viewTypeKey: extra.viewTypeKey,
        objectId: props.objectId,
        objectKey: props.objectKey,
        objectLoaded: props.objectLoaded,
        navigate,
        applyWorkspace: () => undefined,
        applyView: () => undefined,
        applyCatalog: () => undefined,
        applyObject,
        listObjects: list,
        listObjectsByIdSuffix: listById,
      })
    },
    {
      wrapper,
      initialProps: {
        search,
        objectId: null as string | null,
        objectKey: null as string | null,
        objectLoaded: false,
      },
    },
  )
  return { navigate, applyObject, rerender: hook.rerender }
}

describe('readable URL sync', () => {
  it('writes slugs and the object key, not uuids', async () => {
    const list = vi.fn(async () => page([]))
    const hook = setup({}, list)
    await waitFor(() => expect(hook.navigate).toHaveBeenCalled())
    expect(hook.navigate).toHaveBeenCalledWith({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog' },
      replace: true,
    })
    const written = JSON.stringify(hook.navigate.mock.calls)
    expect(written).not.toContain(workspace)
    expect(written).not.toContain(view)
    expect(written).not.toContain(MASTER_CATALOG_ID)

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog' },
      objectId: product,
      objectKey: key,
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string } }
      expect(last.search.object).toBe(key)
    })
  })

  it('escapes a literal tilde in a typed SKU when writing the URL', async () => {
    const list = vi.fn(async () => page([]))
    const hook = setup({}, list)
    await waitFor(() => expect(hook.navigate).toHaveBeenCalled())
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog' },
      objectId: product,
      objectKey: 'A~deadbeef',
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string } }
      expect(last.search.object).toBe('A~~deadbeef')
    })
  })

  it('opens a typed SKU with a literal tilde instead of reading it as a suffix', async () => {
    const tildeKey = 'A~deadbeef'
    const list = vi.fn(async (_catalog: string, key: string) => {
      if (key === tildeKey) return page([{ id: product, key: tildeKey }])
      return page([])
    })
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'A~~deadbeef',
    }, list)
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(product))
    expect(list).toHaveBeenCalledWith('master', tildeKey, 'product')
  })

  it('opens a direct key link and ignores a uuid', async () => {
    const list = vi.fn(async (_catalog: string, key: string) => {
      if (key === 'ART-1') return page([{ id: product, key: 'ART-1' }])
      return page([])
    })
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'ART-1',
    }, list)
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(product))
    expect(list).toHaveBeenCalledWith('master', 'ART-1', 'product')

    hook.applyObject.mockClear()
    hook.rerender({
      search: {
        ws: 'products',
        view: 'products',
        catalog: 'master_catalog',
        object: product,
      },
      objectId: null,
      objectKey: null,
      objectLoaded: false,
    })
    await waitFor(() => expect(list).toHaveBeenCalledWith('master', product, 'product'))
    expect(hook.applyObject).not.toHaveBeenCalled()
  })

  it('resolves a shared key inside the product type and not as the article', async () => {
    const list = vi.fn(async (_catalog: string, key: string, typeKey?: string | null) => {
      if (key === 'SAME' && typeKey === 'product') return page([{ id: product, key: 'SAME' }])
      return page([{ id: product, key: 'SAME' }, { id: article, key: 'SAME' }])
    })
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'SAME',
    }, list)
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(product))
    expect(hook.applyObject).not.toHaveBeenCalledWith(article)
  })

  it('opens a keyless row through its short id fallback', async () => {
    const link = '018f0000-0000-7000-8000-00000000abcd'
    const token = `~${shortId(link)}`
    const list = vi.fn(async () => page([]))
    const listById = vi.fn(async () => page([{ id: link, key: null }]))
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: token,
    }, list, listById)
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(link))
    expect(listById).toHaveBeenCalledWith('master', shortId(link), null)
    expect(list).not.toHaveBeenCalled()
  })

  it('writes an extended keyless token and roundtrips it from that token', async () => {
    const first = '018f0000-0000-7000-8000-0000aaaa12345678'
    const second = '018f0000-0000-7000-8000-0000bbbb12345678'
    const rows = [{ id: first, key: null }, { id: second, key: null }]
    const token = objectTokenFor(rows[0], rows)!
    expect(token).not.toBe(`~${shortId(first)}`)
    expect(token.slice(1)).toHaveLength(12)
    const list = vi.fn(async () => page([]))
    const listById = vi.fn(async () => page(rows))
    const hook = setup({ ws: 'products', view: 'products', catalog: 'master_catalog' }, list, listById)

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog' },
      objectId: first,
      objectKey: null,
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string } }
      expect(last.search.object).toBe(token)
    })
    expect(listById).toHaveBeenCalledWith('master', shortId(first), null)
  })

  it('opens a colliding keyless row from its emitted extended token', async () => {
    const first = '018f0000-0000-7000-8000-0000aaaa12345678'
    const second = '018f0000-0000-7000-8000-0000bbbb12345678'
    const rows = [{ id: first, key: null }, { id: second, key: null }]
    const token = objectTokenFor(rows[1], rows)!
    const list = vi.fn(async () => page([]))
    const listById = vi.fn(async () => page(rows))
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: token,
    }, list, listById)
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(second))
    expect(listById).toHaveBeenCalledWith('master', shortId(first), null)
    expect(list).not.toHaveBeenCalled()
  })

  it('fails closed on the shared short tail of a keyless collision', async () => {
    const first = '018f0000-0000-7000-8000-0000aaaa12345678'
    const second = '018f0000-0000-7000-8000-0000bbbb12345678'
    const rows = [{ id: first, key: null }, { id: second, key: null }]
    const list = vi.fn(async () => page([]))
    const listById = vi.fn(async () => page(rows))
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: `~${shortId(first)}`,
    }, list, listById)
    await waitFor(() => expect(listById).toHaveBeenCalledWith('master', shortId(first), null))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(hook.applyObject).not.toHaveBeenCalled()
  })

  it('ignores an async lookup that finishes after the selection moved on', async () => {
    const pending: Record<string, (value: ObjectKeyPage) => void> = {}
    const list = vi.fn((_catalog: string, key: string) => new Promise<ObjectKeyPage>((resolve) => {
      pending[key] = resolve
    }))
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'OLD',
    }, list)
    await waitFor(() => expect(pending.OLD).toBeTruthy())

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'NEW' },
      objectId: null,
      objectKey: null,
      objectLoaded: false,
    })
    await waitFor(() => expect(pending.NEW).toBeTruthy())
    hook.applyObject.mockClear()

    pending.OLD(page([{ id: product, key: 'OLD' }]))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(hook.applyObject).not.toHaveBeenCalledWith(product)

    const next = '018f0000-0000-7000-8000-0000000000cc'
    pending.NEW(page([{ id: next, key: 'NEW' }]))
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(next))
  })

  it('resolves a direct link after workspace/view/type settle and a row auto-selects', async () => {
    catalogs()
    let resolveList!: (value: ObjectKeyPage) => void
    const list = vi.fn(() => new Promise<ObjectKeyPage>((resolve) => {
      resolveList = resolve
    }))
    const navigate = vi.fn()
    const applyObject = vi.fn()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    type Props = {
      ready: boolean
      workspaceId: string | null
      viewId: string | null
      objectTypeKey: string | null
      objectId: string | null
    }
    const search = { ws: 'products', view: 'products', catalog: 'master_catalog', object: key }
    const hook = renderHook(
      (props: Props) => useReadableUrl({
        search,
        ready: props.ready,
        catalogsEnabled: true,
        workspaceId: props.workspaceId,
        workspaces: [{ id: workspace, label: 'Products' }],
        viewId: props.viewId,
        views: [{ id: view, label: 'Products' }],
        openViewIds: props.viewId ? [props.viewId] : [],
        catalogId: MASTER_CATALOG_ID,
        objectTypeKey: props.objectTypeKey,
        objectId: props.objectId,
        objectKey: null,
        objectLoaded: false,
        navigate,
        applyWorkspace: () => undefined,
        applyView: () => undefined,
        applyCatalog: () => undefined,
        applyObject,
        listObjects: list,
        listObjectsByIdSuffix: async () => page([]),
      }),
      {
        wrapper,
        initialProps: {
          ready: false,
          workspaceId: null as string | null,
          viewId: null as string | null,
          objectTypeKey: null as string | null,
          objectId: null as string | null,
        },
      },
    )

    hook.rerender({ ready: true, workspaceId: null, viewId: null, objectTypeKey: null, objectId: null })
    hook.rerender({ ready: true, workspaceId: workspace, viewId: null, objectTypeKey: null, objectId: null })
    hook.rerender({ ready: true, workspaceId: workspace, viewId: view, objectTypeKey: 'product', objectId: null })
    await waitFor(() => expect(list).toHaveBeenCalledWith('master', key, 'product'))

    const other = '018f0000-0000-7000-8000-0000000000ff'
    hook.rerender({ ready: true, workspaceId: workspace, viewId: view, objectTypeKey: 'product', objectId: other })

    resolveList(page([{ id: product, key }]))
    await waitFor(() => expect(applyObject).toHaveBeenCalledWith(product))
  })

  it('keeps the URL object pin while another object is already selected', async () => {
    const first = '018f0000-0000-7000-8000-0000000000ee'
    const second = '018f0000-0000-7000-8000-0000000000ff'
    const list = vi.fn(async (_catalog: string, key: string) => {
      if (key === 'FIRST') return page([{ id: first, key: 'FIRST' }])
      return page([])
    })
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'FIRST',
    }, list)
    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'FIRST' },
      objectId: second,
      objectKey: 'SECOND',
      objectLoaded: true,
    })
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(first))
    expect(hook.applyObject).not.toHaveBeenCalledWith(second)
  })

  it('resolves a direct link in the type of the view named by the URL', async () => {
    const list = vi.fn(async (_catalog: string, key: string, typeKey?: string | null) => {
      if (key === 'SAME' && typeKey === 'product') return page([{ id: product, key: 'SAME' }])
      return page([])
    })
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'SAME',
    }, list, async () => page([]), {
      // The persisted focus (and so the detail list) may be another type.
      objectTypeKey: 'article',
      viewTypeKey: (viewId) => viewId === view ? 'product' : null,
    })
    await waitFor(() => expect(hook.applyObject).toHaveBeenCalledWith(product))
    expect(list).toHaveBeenCalledWith('master', 'SAME', 'product')
    expect(list).not.toHaveBeenCalledWith('master', 'SAME', 'article')
  })

  it('keeps the current object token while the next object loads, so Back has no empty step', async () => {
    const list = vi.fn(async () => page([]))
    const first = '018f0000-0000-7000-8000-0000000000cc'
    const second = '018f0000-0000-7000-8000-0000000000dd'
    const hook = setup({ ws: 'products', view: 'products', catalog: 'master_catalog' }, list)
    await new Promise((resolve) => setTimeout(resolve, 20))
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog' },
      objectId: first,
      objectKey: 'FIRST',
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string } }
      expect(last.search.object).toBe('FIRST')
    })

    hook.navigate.mockClear()
    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'FIRST' },
      objectId: second,
      objectKey: null,
      objectLoaded: false,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(hook.navigate).not.toHaveBeenCalled()

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'FIRST' },
      objectId: second,
      objectKey: 'SECOND',
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string }; replace: boolean }
      expect(last.search.object).toBe('SECOND')
      expect(last.replace).toBe(false)
    })
  })

  it('replaces history when a rename changes the token for the same object', async () => {
    const list = vi.fn(async () => page([]))
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
      object: 'OLD',
    }, list)
    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'OLD' },
      objectId: product,
      objectKey: 'OLD',
      objectLoaded: true,
    })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'OLD' },
      objectId: product,
      objectKey: 'NEW',
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string }; replace: boolean }
      expect(last.search.object).toBe('NEW')
      expect(last.replace).toBe(true)
    })
  })

  it('keeps the rename replace when the duplicate check is still loading', async () => {
    let resolveNew!: (value: ObjectKeyPage) => void
    const list = vi.fn((_catalog: string, key: string) => {
      if (key === 'NEW') return new Promise<ObjectKeyPage>((resolve) => { resolveNew = resolve })
      return Promise.resolve(page([{ id: product, key: 'OLD' }]))
    })
    const hook = setup({
      ws: 'products',
      view: 'products',
      catalog: 'master_catalog',
    }, list, async () => page([]), { objectTypeKey: null })
    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog' },
      objectId: product,
      objectKey: 'OLD',
      objectLoaded: true,
    })
    await waitFor(() => expect(list).toHaveBeenCalledWith('master', 'OLD'))
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string } }
      expect(last.search.object).toBe('OLD')
    })
    hook.navigate.mockClear()

    hook.rerender({
      search: { ws: 'products', view: 'products', catalog: 'master_catalog', object: 'OLD' },
      objectId: product,
      objectKey: 'NEW',
      objectLoaded: true,
    })
    await waitFor(() => expect(list).toHaveBeenCalledWith('master', 'NEW'))
    expect(hook.navigate).not.toHaveBeenCalled()

    resolveNew(page([{ id: product, key: 'NEW' }]))
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string }; replace: boolean }
      expect(last.search.object).toBe('NEW')
      expect(last.replace).toBe(true)
    })
  })
})
