import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function createProductsWorkspace(page: Page): Promise<{ id: string; name: string; viewId: string }> {
  const id = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  const suffix = id.slice(0, 8)
  const name = `Row275 sort ${suffix}`
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id,
      name,
      locked: false,
      share_token: `row275-sort-${suffix}`,
      layout: { type: 'tabs', views: [viewId], active: 0 },
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()
  const view = await page.request.post('/v1/views', {
    data: {
      id: viewId,
      workspace_id: id,
      type: 'object_table',
      title: 'Products',
      pane: 'main',
      position: 0,
      state: {
        columns: ['number', 'name', 'status'],
        sort: 'number',
        object_type: PRODUCT_TYPE_ID,
        type_key: 'product',
        table: { sort: 'number', groupBy: '', sizes: {} },
      },
    },
  })
  expect(view.ok(), `create Products view ${view.status()}`).toBeTruthy()
  return { id, name, viewId }
}

test('malformed table sort still lists rows after reload', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const workspace = await createProductsWorkspace(page)
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
    await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
    const tab = page.locator('nav.tabs button.tab').filter({ hasText: workspace.name }).first()
    await tab.click()
    await expect(tab).toHaveClass(/active/)
    const table = mainTable(page)
    await expect(table).toBeVisible({ timeout: 30_000 })
    await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(table.getByTestId('column-prefs-skeleton')).toHaveCount(0)
  } finally {
    try {
      await page.request.delete(`/v1/workspaces/${workspace.id}`)
    } catch {
      // ignore
    }
  }
})