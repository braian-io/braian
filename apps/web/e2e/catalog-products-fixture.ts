import { expect, type Page } from '@playwright/test'

export const MASTER_CATALOG_ID = '018f1000-0000-7000-8000-000000000001'
export const SAP_CATALOG_ID = '018f1000-0000-7000-8000-000000000002'
export const PRODUCTS_WORKSPACE_ID = '018f2000-0000-7000-8000-000000000003'
export const PRODUCTS_VIEW_ID = '018f2000-0000-7000-8000-000000000302'

type ViewPostBody = {
  id?: string
  state?: { catalogOverride?: { catalogId?: string } }
}

/** Wait until a view POST with the expected catalog override has finished. */
export async function waitForViewCatalogOverridePost(page: Page, catalogId: string | null) {
  await page.waitForResponse(
    (item) => {
      if (item.request().method() !== 'POST' || !item.url().includes('/v1/views') || !item.ok()) {
        return false
      }
      const body = item.request().postDataJSON() as ViewPostBody | null
      if (!body || body.id !== PRODUCTS_VIEW_ID) return false
      const override = body.state?.catalogOverride?.catalogId ?? null
      return override === catalogId
    },
    { timeout: 30_000 },
  )
}

export async function storedProductsViewOverride(page: Page) {
  return page.evaluate(
    async ({ workspaceId, viewId }) => {
      const res = await fetch(`/v1/workspaces/${workspaceId}`, { credentials: 'include' })
      if (!res.ok) return { ok: false as const, status: res.status }
      const ws = await res.json() as {
        views?: { id?: string; state?: { catalogOverride?: { catalogId?: string } } }[]
      }
      const view = (ws.views ?? []).find((row) => row.id === viewId)
      return {
        ok: true as const,
        override: view?.state?.catalogOverride?.catalogId ?? null,
      }
    },
    { workspaceId: PRODUCTS_WORKSPACE_ID, viewId: PRODUCTS_VIEW_ID },
  )
}

/** Set or clear the Products table override without touching the workspace default. */
export async function setProductsViewCatalogOverride(page: Page, catalogId: string | null) {
  const post = page.waitForResponse(
    (item) => {
      if (item.request().method() !== 'POST' || !item.url().includes('/v1/views')) return false
      const body = item.request().postDataJSON() as ViewPostBody | null
      return body?.id === PRODUCTS_VIEW_ID
    },
    { timeout: 30_000 },
  )
  const result = await page.evaluate(
    async ({ workspaceId, viewId, catalogId: nextCatalogId }) => {
      const get = await fetch(`/v1/workspaces/${workspaceId}`, { credentials: 'include' })
      if (!get.ok) return { ok: false, step: 'get', status: get.status }
      const ws = await get.json() as {
        views?: {
          id?: string
          type?: string
          title?: string
          pane?: string
          position?: number
          state?: Record<string, unknown>
        }[]
      }
      const view = (ws.views ?? []).find((row) => row.id === viewId)
      if (!view) return { ok: false, step: 'find' }
      const state: Record<string, unknown> = { ...(view.state ?? {}) }
      if (nextCatalogId) {
        state.catalogOverride = { catalogId: nextCatalogId }
      } else {
        // A missing key is left as stored. Null removes catalogOverride.
        state.catalogOverride = null
      }
      const save = await fetch('/v1/views', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: view.id,
          workspace_id: workspaceId,
          type: view.type,
          title: view.title,
          pane: view.pane ?? 'center',
          position: view.position ?? 0,
          state,
        }),
      })
      if (!save.ok) {
        return { ok: false, step: 'post', status: save.status, body: await save.text() }
      }
      return { ok: true }
    },
    { workspaceId: PRODUCTS_WORKSPACE_ID, viewId: PRODUCTS_VIEW_ID, catalogId },
  )
  if (!result.ok) {
    throw new Error(`setProductsViewCatalogOverride failed: ${JSON.stringify(result)}`)
  }
  const response = await post
  expect(response.ok()).toBeTruthy()
  await expect
    .poll(async () => (await storedProductsViewOverride(page)).override, { timeout: 30_000 })
    .toBe(catalogId)
}