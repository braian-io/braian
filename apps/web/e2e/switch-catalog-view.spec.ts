import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const MASTER_CATALOG_ID = '018f1000-0000-7000-8000-000000000001'
const SAP_CATALOG_ID = '018f1000-0000-7000-8000-000000000002'
const PRODUCTS_WORKSPACE_ID = '018f2000-0000-7000-8000-000000000003'
const PRODUCTS_VIEW_ID = '018f2000-0000-7000-8000-000000000302'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

/** Open the header picker only after /v1/catalogs has returned source rows. */
async function waitForCatalogs(page: Page) {
  await expect
    .poll(async () => {
      const response = await page.evaluate(async () => {
        const res = await fetch('/v1/catalogs', { credentials: 'include' })
        if (!res.ok) return [] as { key?: string }[]
        return (await res.json()) as { key?: string }[]
      })
      return Array.isArray(response) && response.some((row) => row.key === 'sap')
    }, { timeout: 30_000 })
    .toBe(true)
}

/** Set or clear the Products table override without touching the workspace default. */
async function setProductsViewOverride(page: Page, catalogId: string | null) {
  const result = await page.evaluate(
    async ({ workspaceId, viewId, catalogId }) => {
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
      if (catalogId) {
        state.catalogOverride = { catalogId }
      } else {
        delete state.catalogOverride
      }
      const post = await fetch('/v1/views', {
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
      if (!post.ok) {
        return { ok: false, step: 'post', status: post.status, body: await post.text() }
      }
      return { ok: true }
    },
    { workspaceId: PRODUCTS_WORKSPACE_ID, viewId: PRODUCTS_VIEW_ID, catalogId },
  )
  if (!result.ok) {
    throw new Error(`setProductsViewOverride failed: ${JSON.stringify(result)}`)
  }
}

test.afterEach(async ({ page }) => {
  try {
    await setProductsViewOverride(page, null)
  } catch {
    // Login may have failed; nothing to restore.
  }
})

test('Ctrl+K Switch catalog sets the focused view catalog', async ({ page }) => {
  await login(page)
  await setProductsViewOverride(page, null)
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await page.getByTestId('object-table').click({ position: { x: 24, y: 24 } })

  const label = page.locator('.pane.focused').getByTestId('view-source-label')
  const selector = page.getByTestId('catalog-selector')
  await expect(label).toHaveText('All Products')
  await expect(selector).toContainText(/Master catalog/i)
  await waitForCatalogs(page)

  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(page.getByTestId('palette-input')).toBeVisible()
  await page.getByTestId('palette-input').fill('Switch catalog')
  await expect(palette.getByRole('option', { name: /^Switch catalog/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.getByRole('option', { name: /SAP ERP/ })).toBeVisible()
  await palette.getByRole('option', { name: /SAP ERP/ }).click()

  await expect(label).toHaveText('All Products · SAP ERP')
  await expect(selector).toContainText(/Master catalog/i)
  await page.screenshot({ path: 'test-results/117-switch-catalog-view.png' })

  const stored = await page.evaluate(async ({ workspaceId, viewId }) => {
    const res = await fetch(`/v1/workspaces/${workspaceId}`, { credentials: 'include' })
    if (!res.ok) return { ok: false, status: res.status }
    const ws = await res.json() as {
      catalog?: { catalogId?: string }
      views?: { id?: string; state?: { catalogOverride?: { catalogId?: string } } }[]
    }
    const view = (ws.views ?? []).find((row) => row.id === viewId)
    return {
      ok: true,
      workspaceCatalog: ws.catalog?.catalogId ?? null,
      override: view?.state?.catalogOverride?.catalogId ?? null,
    }
  }, { workspaceId: PRODUCTS_WORKSPACE_ID, viewId: PRODUCTS_VIEW_ID })

  expect(stored).toEqual({
    ok: true,
    workspaceCatalog: MASTER_CATALOG_ID,
    override: SAP_CATALOG_ID,
  })
})
