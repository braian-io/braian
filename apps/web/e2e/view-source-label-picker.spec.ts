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

async function openSourcePickerFromLabel(page: Page, products: Locator) {
  const label = products.getByTestId('view-source-label')
  await expect(label).toHaveAttribute('aria-label', 'Change source')
  await label.click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

async function choosePaletteHit(page: Page, palette: Locator, title: string) {
  await palette.locator('.hit').filter({ hasText: title }).first().click()
  await expect(palette).toHaveCount(0)
}

test.describe('view source label opens Select source', () => {
  test('click label, switch All Products and Food tree, persists after reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const name = `Label picker ${workspaceId.slice(0, 8)}`
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
        share_token: `label-picker-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

    for (const view of [
      { id: treeId, type: 'structure_tree', title: 'Food', pane: 'left', position: 0, state: { expanded: ['dairy'] } },
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
          source: { kind: 'all' },
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
      await page.locator('nav.tabs').getByRole('button', { name: new RegExp(name) }).click()
      const products = pane(page, productsId)
      const tree = pane(page, treeId)
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })

      let palette = await openSourcePickerFromLabel(page, products)
      await choosePaletteHit(page, palette, 'Products from Food')
      await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })

      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_CHEESE_PRODUCT_NAMES.length)

      palette = await openSourcePickerFromLabel(page, products)
      await choosePaletteHit(page, palette, 'All Products')
      await expect(products.getByTestId('view-source-label')).toHaveText('All Products')
      const allRows = await products.getByTestId('object-row').count()
      expect(allRows).toBeGreaterThan(SEED_CHEESE_PRODUCT_NAMES.length)

      await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
      await expect(products.getByTestId('view-source-label')).toHaveText('All Products')
      expect(await products.getByTestId('object-row').count()).toBe(allRows)

      palette = await openSourcePickerFromLabel(page, products)
      await choosePaletteHit(page, palette, 'Products from Food')
      await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })

      await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_MILK_PRODUCT_NAMES.length)

      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: new RegExp(name) }).click()
      const productsReloaded = pane(page, productsId)
      const treeReloaded = pane(page, treeId)
      await expect(productsReloaded.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
      await treeReloaded.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await expect(productsReloaded.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })

      const label = productsReloaded.getByTestId('view-source-label')
      await label.focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('command-palette')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)
      await expect(label).toBeFocused()
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})