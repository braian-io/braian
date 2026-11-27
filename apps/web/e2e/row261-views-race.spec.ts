import { expect, test, type Page } from '@playwright/test'
import {
  MASTER_CATALOG_ID,
  PRODUCTS_VIEW_ID,
  PRODUCTS_WORKSPACE_ID,
  setProductsViewCatalogOverride,
  storedProductsViewOverride,
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

/** Pick a catalog for the focused view without waiting for the save to finish. */
async function switchFocusedCatalog(page: Page, name: RegExp) {
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(page.getByTestId('palette-input')).toBeVisible()
  await page.getByTestId('palette-input').fill('Switch catalog')
  await expect(palette.getByRole('option', { name: /^Switch catalog/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.getByRole('option', { name })).toBeVisible()
  await palette.getByRole('option', { name }).click()
  await expect(palette).toBeHidden()
}

test.afterEach(async ({ page }) => {
  try {
    await setProductsViewCatalogOverride(page, null)
  } catch {
    // Login may have failed; nothing to restore.
  }
})

test('rapid catalog switches keep the last view override after reload', async ({ page }) => {
  await login(page)
  await setProductsViewCatalogOverride(page, null)
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await focusProductsTable(page)
  await waitForCatalogs(page)

  await switchFocusedCatalog(page, /SAP ERP/)
  await switchFocusedCatalog(page, /Master catalog/)

  await expect
    .poll(async () => (await storedProductsViewOverride(page)).override, { timeout: 30_000 })
    .toBe(MASTER_CATALOG_ID)

  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await focusProductsTable(page)

  const stored = await page.evaluate(async ({ workspaceId, viewId }) => {
    const res = await fetch(`/v1/workspaces/${workspaceId}`, { credentials: 'include' })
    if (!res.ok) return { ok: false as const, status: res.status }
    const ws = await res.json() as {
      views?: { id?: string; state?: { catalogOverride?: { catalogId?: string } | null } }[]
    }
    const view = (ws.views ?? []).find((row) => row.id === viewId)
    return {
      ok: true as const,
      override: view?.state?.catalogOverride?.catalogId ?? null,
    }
  }, { workspaceId: PRODUCTS_WORKSPACE_ID, viewId: PRODUCTS_VIEW_ID })

  expect(stored).toEqual({ ok: true, override: MASTER_CATALOG_ID })
  await expect(page.locator('.pane.focused').getByTestId('view-source-label')).toHaveText('All Products · Food')
})
