import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { SEED_CHEESE_PRODUCT_NAMES, SEED_MILK_PRODUCT_NAMES } from './seed-product-names'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
}

function pane(page: Page, viewId: string): Locator {
  return page.locator(`[data-pane="${viewId}"]`)
}

async function viewState(page: Page, workspaceId: string, viewId: string) {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as {
    views?: Array<{ id?: string; state?: Record<string, unknown> }>
  }
  return body.views?.find((view) => view.id === viewId)?.state
}

test.describe('lock a peer-linked table view', () => {
  test('keeps rows and label while locked, persists across reload, then follows again after unlock', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const name = `View lock ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.22, 0.78],
      children: [
        { type: 'tabs', views: [treeId], active: 0 },
        { type: 'tabs', views: [productsId], active: 0 },
      ],
    }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `view-lock-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

    for (const view of [
      {
        id: treeId,
        type: 'structure_tree',
        title: 'Food',
        pane: 'left',
        position: 0,
        state: { expanded: ['dairy', 'beverages'], structure_key: 'food' },
      },
      {
        id: productsId,
        type: 'object_table',
        title: 'Products',
        pane: 'center',
        position: 0,
        state: {
          columns: ['number', 'name', 'status'],
          sort: 'number',
          object_type: PRODUCT_TYPE_ID,
          type_key: 'product',
        },
      },
    ]) {
      const response = await page.request.post('/v1/views', {
        data: { ...view, workspace_id: workspaceId },
      })
      expect(response.ok(), `create view ${view.type} ${response.status()}`).toBeTruthy()
    }

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /View lock/ }).click()
      const tree = pane(page, treeId)
      const products = pane(page, productsId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })

      await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_MILK_PRODUCT_NAMES.length)

      const lock = products.getByTestId('view-source-lock')
      await expect(lock).toHaveAttribute('aria-pressed', 'false')
      await lock.click()
      await expect(lock).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(async () => (await viewState(page, workspaceId, productsId))?.sourceLocked).toBe(true)

      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_MILK_PRODUCT_NAMES.length)
      for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(0)
      }

      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /View lock/ }).click()
      const productsReloaded = pane(page, productsId)
      await expect(productsReloaded.getByTestId('view-source-lock')).toHaveAttribute('aria-pressed', 'true')
      await expect(productsReloaded.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })

      await productsReloaded.getByTestId('view-source-lock').click()
      await expect(productsReloaded.getByTestId('view-source-lock')).toHaveAttribute('aria-pressed', 'false')

      const treeReloaded = pane(page, treeId)
      await treeReloaded.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await expect(productsReloaded.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })
      await expect.poll(async () => productsReloaded.getByTestId('object-row').count()).toBe(SEED_CHEESE_PRODUCT_NAMES.length)
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})