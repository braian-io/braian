// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MASTER_CATALOG_ID } from './catalog-ref'
import type { ObjectKeyPage } from './url-object'
import { useReadableUrl } from './use-readable-url'

const product = '018f0000-0000-7000-8000-0000000000aa'
const article = '018f0000-0000-7000-8000-0000000000bb'
const workspace = '018f2000-0000-7000-8000-000000000003'
const view = '018f2000-0000-7000-8000-000000000010'

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

function page(rows: Array<{ id: string; key: string }>): ObjectKeyPage {
  return { rows, complete: true }
}

function setup(
  search: Record<string, string>,
  list: (catalog: string, key: string, typeKey?: string | null) => Promise<ObjectKeyPage>,
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
        objectTypeKey: 'product',
        objectId: props.objectId,
        objectKey: props.objectKey,
        objectLoaded: props.objectLoaded,
        navigate,
        applyWorkspace: () => undefined,
        applyView: () => undefined,
        applyCatalog: () => undefined,
        applyObject,
        listObjects: list,
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
      objectKey: 'ART/Å& +',
      objectLoaded: true,
    })
    await waitFor(() => {
      const last = hook.navigate.mock.calls.at(-1)?.[0] as { search: { object?: string } }
      expect(last.search.object).toBe('ART/Å& +')
    })
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
})
