import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

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

async function chooseAllProducts(page: Page, products: Locator) {
  await products.getByTestId('object-table').first().click({ position: { x: 24, y: 24 } })
  await products.hover()
  await products.getByTestId('view-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.locator('.hit').filter({ hasText: 'All Products' }).first().click()
  await expect(palette).toHaveCount(0)
  await expect(products.getByTestId('view-source-label')).toHaveText('All Products')
}

test.describe('structure tree auto-links object tables (Notion row 41)', () => {
  test('explicit All Products follows Food after the tree is opened', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const name = `Tree link ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'tabs',
      views: [productsId],
      active: 0,
    }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `tree-link-${workspaceId.slice(0, 8)}`,
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
      await page.locator('nav.tabs').getByRole('button', { name: /Tree link/ }).click()
      const products = pane(page, productsId)
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await chooseAllProducts(page, products)
      const allRows = await products.getByTestId('object-row').count()
      expect(allRows).toBeGreaterThan(50)

      await page.keyboard.press('Control+k')
      const palette = page.getByTestId('command-palette')
      await expect(palette).toBeVisible()
      await palette.getByTestId('palette-input').fill('Open view')
      await page.keyboard.press('Enter')
      await palette.getByTestId('palette-input').fill('Food')
      await palette.getByRole('option', { name: /^Food/ }).first().click()
      await expect(palette).toHaveCount(0)

      const tree = pane(page, treeId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })

      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })

      const cheeseChip = products.getByTestId('assortment').filter({ hasText: 'Cheese' })
      await expect(cheeseChip).not.toHaveClass(/\bon\b/)

      await expect.poll(async () => products.getByTestId('object-row').count()).toBeLessThan(allRows)
      const rows = products.getByTestId('object-row')
      const count = await rows.count()
      expect(count).toBeGreaterThan(0)
      for (let index = 0; index < Math.min(count, 5); index += 1) {
        await expect(rows.nth(index)).toContainText(/cheddar|brie|gouda|cheese|PROD-/i)
      }

      await products.getByTestId('view-source-label').click()
      await expect(products.getByTestId('view-source-label')).toHaveText('All Products', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(allRows)
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})