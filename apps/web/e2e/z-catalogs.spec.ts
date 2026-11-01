import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

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

async function pickCatalog(page: Page, name: RegExp) {
  await waitForCatalogs(page)
  const selector = page.getByTestId('catalog-selector')
  await selector.click()
  const menu = page.getByTestId('catalog-selector-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name }).click()
}

const MASTER_CATALOG_ID = '018f1000-0000-7000-8000-000000000001'
const PRODUCTS_WORKSPACE_ID = '018f2000-0000-7000-8000-000000000003'

/** Reset Products workspace catalog via API (no UI). File is named z-catalogs so
 * Playwright's alphabetical order keeps it last with workers=1 shared DB. */
async function restoreProductsMaster(page: Page) {
  await page.evaluate(
    async ({ workspaceId, catalogId }) => {
      const res = await fetch(`/v1/workspaces/${workspaceId}`, { credentials: 'include' })
      if (!res.ok) return
      const ws = await res.json() as {
        name?: string
        locked?: boolean
        share_token?: string | null
        layout?: unknown
      }
      await fetch('/v1/workspaces', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: workspaceId,
          name: ws.name,
          locked: ws.locked ?? false,
          share_token: ws.share_token ?? undefined,
          layout: ws.layout ?? {},
          catalog: { catalogId },
        }),
      })
    },
    { workspaceId: PRODUCTS_WORKSPACE_ID, catalogId: MASTER_CATALOG_ID },
  )
}

test.afterEach(async ({ page }) => {
  try {
    await restoreProductsMaster(page)
  } catch {
    // Login may have failed; nothing to restore.
  }
})

test('header catalog selector switches the workspace catalog', async ({ page }) => {
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /Products/ }).click()
  await expect(page.getByTestId('catalog-chip')).toHaveCount(0)
  const selector = page.getByTestId('catalog-selector')
  await expect(selector).toBeVisible()
  await expect(selector).toContainText(/Master catalog/i)
  await waitForCatalogs(page)
  await page.screenshot({ path: 'test-results/117-header-before.png' })
  await pickCatalog(page, /SAP ERP/)
  await expect(selector).toContainText(/SAP/i)
  await page.screenshot({ path: 'test-results/117-header-after.png' })
  await expect(page.getByTestId('catalog-chip')).toHaveCount(0)
})

test('Ctrl+K Switch catalog opens straight into the catalog list', async ({ page }) => {
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /Products/ }).click()
  await waitForCatalogs(page)
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(page.getByTestId('palette-input')).toBeVisible()
  await page.getByTestId('palette-input').fill('Switch catalog')
  await expect(palette.getByRole('option', { name: /^Switch catalog/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.crumb')).toContainText(/Switch catalog/i)
  await expect(palette.getByRole('option', { name: /SAP ERP/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/117-palette-switch-catalog.png' })
  await expect(palette.getByRole('option', { name: /On selected object/i })).toHaveCount(0)
  await palette.getByRole('option', { name: /SAP ERP/ }).click()
  await expect(page.getByTestId('catalog-selector')).toContainText(/SAP/i)
})

test('pane-source shows catalog only when the view override differs', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Sources' }).click()
  await expect(page.getByTestId('catalog-selector')).toContainText(/SAP/i)
  // Object table seed title is "SAP" but the dock labels it by type plural "Products".
  await page.locator('.pane-tab-list').getByRole('button', { name: 'Products' }).click()
  const label = page.locator('.pane.focused').getByTestId('view-source-label')
  await expect(label).toBeVisible()
  await expect(label).toContainText(/All Products/)
  await expect(label).not.toContainText('·')

  await pickCatalog(page, /Master catalog/)
  await expect(page.getByTestId('catalog-selector')).toContainText(/Master catalog/i)
  await expect(label).toContainText(/All Products · SAP/)
  await page.screenshot({ path: 'test-results/117-pane-source-differs.png' })
  await expect(page.getByTestId('catalog-chip')).toHaveCount(0)

  await pickCatalog(page, /SAP ERP/)
  await expect(label).toContainText(/All Products/)
  await expect(label).not.toContainText('·')
})

test('sources workspace, merge profile and a locked brand', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Sources' }).click()
  await expect(page.getByTestId('catalogs-view')).toContainText('SAP ERP')
  await expect(page.getByTestId('catalogs-view')).toContainText('Supplier Nordic')
  await expect(page.getByTestId('merge-profiles-view')).toContainText('SAP brand')
  await expect(page.getByTestId('ownership-view')).toBeVisible()
  await expect(page.getByTestId('merge-runs-view')).toHaveCount(0)

  await page.getByRole('button', { name: 'Merge runs' }).click()
  await expect(page.getByTestId('merge-runs-view')).toBeVisible()

  await page.locator('nav.tabs').getByRole('button', { name: /Products/ }).click()
  const row = page.getByTestId('object-row').filter({ hasText: 'PROD-OAT' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByTestId('locked-field')).toContainText('Owned by sap-brand')
  await expect(page.getByTestId('field-origin')).toContainText('PROD-OAT')
  const brand = page.getByTestId('locked-field').locator('input')
  await expect(brand).toHaveValue('Nordic Oat Mill')
  await expect(brand).toHaveAttribute('readonly', '')
})
