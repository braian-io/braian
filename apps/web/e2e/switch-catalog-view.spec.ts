import { expect, test, type Page } from '@playwright/test'
import {
  MASTER_CATALOG_ID,
  PRODUCTS_VIEW_ID,
  PRODUCTS_WORKSPACE_ID,
  SAP_CATALOG_ID,
  setProductsViewCatalogOverride,
  storedProductsViewOverride,
  waitForViewCatalogOverridePost,
} from './catalog-products-fixture'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

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

async function focusProductsTable(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await mainTable(page).click({ position: { x: 24, y: 24 } })
  await expect(page.locator('.pane.focused')).toBeVisible()
}

test.afterEach(async ({ page }) => {
  try {
    await setProductsViewCatalogOverride(page, null)
  } catch {
    // Login may have failed; nothing to restore.
  }
})

test('Ctrl+K Switch catalog sets the focused view catalog', async ({ page }) => {
  await login(page)
  await setProductsViewCatalogOverride(page, null)
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await focusProductsTable(page)

  const label = page.locator('.pane.focused').getByTestId('view-source-label')
  const selector = page.getByTestId('catalog-selector')
  await expect(label).toHaveText('All Products')
  await expect(selector).toContainText(/Master catalog/i)
  await waitForCatalogs(page)

  const overrideSave = waitForViewCatalogOverridePost(page, SAP_CATALOG_ID)
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(page.getByTestId('palette-input')).toBeVisible()
  await page.getByTestId('palette-input').fill('Switch catalog')
  await expect(palette.getByRole('option', { name: /^Switch catalog/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.getByRole('option', { name: /SAP ERP/ })).toBeVisible()
  await palette.getByRole('option', { name: /SAP ERP/ }).click()
  await overrideSave

  await expect(label).toHaveText('All Products · SAP ERP')
  await expect(selector).toContainText(/Master catalog/i)
  await page.screenshot({ path: 'test-results/117-switch-catalog-view.png' })

  await expect
    .poll(async () => (await storedProductsViewOverride(page)).override, { timeout: 30_000 })
    .toBe(SAP_CATALOG_ID)

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