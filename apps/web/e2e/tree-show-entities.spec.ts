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

async function expectNamedProduct(table: Locator, name: string, present: boolean) {
  await table.getByTestId('quick-filter').fill(name)
  const rows = table.getByTestId('object-row').filter({ hasText: name })
  await expect(rows).toHaveCount(present ? 1 : 0)
  await table.getByTestId('quick-filter').fill('')
}

test.describe('structure tree Show entity type', () => {
  test('Show Products on an existing table follows the subtree filter', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const name = `Tree show ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.24, 0.76],
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
        share_token: `tree-show-${workspaceId.slice(0, 8)}`,
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
        state: { expanded: ['dairy'], structure_key: 'food' },
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
      await page.locator('nav.tabs').getByRole('button', { name: new RegExp(name) }).click()
      const tree = pane(page, treeId)
      let products = pane(page, productsId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

      const cheese = tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first()
      await cheese.click({ button: 'right' })
      const menu = page.getByTestId('context-menu')
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('button', { name: 'Show Products' })).toBeVisible()
      await menu.getByRole('button', { name: 'Show Products' }).click()
      await expect(menu).toHaveCount(0)

      await expect(products.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_CHEESE_PRODUCT_NAMES.length)
      for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(1)
      }
      for (const productName of SEED_MILK_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(0)
      }

      await tree.getByTestId('structure-root').click({ button: 'right' })
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('button', { name: 'Show Products' })).toBeVisible()
      await expect(menu.getByRole('button', { name: /^Rename/ })).toHaveCount(0)
      await menu.getByRole('button', { name: 'Show Products' }).click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Food', { timeout: 30_000 })
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })

  test('Show Products opens a new table when the layout has only the tree', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const name = `Tree show only ${workspaceId.slice(0, 8)}`
    const layout = { type: 'tabs', views: [treeId], active: 0 }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `tree-show-only-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

    const viewResponse = await page.request.post('/v1/views', {
      data: {
        id: treeId,
        workspace_id: workspaceId,
        type: 'structure_tree',
        title: 'Food',
        pane: 'left',
        position: 0,
        state: { expanded: ['dairy'], structure_key: 'food' },
      },
    })
    expect(viewResponse.ok()).toBeTruthy()

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: new RegExp(name) }).click()
      const tree = pane(page, treeId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      const cheese = tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first()
      await cheese.click({ button: 'right' })
      const menu = page.getByTestId('context-menu')
      await expect(menu).toBeVisible()
      await menu.getByRole('button', { name: 'Show Products' }).click()

      const productsPane = page.locator('[data-pane]').filter({
        has: page.locator('[data-view-type="object_table"]'),
      })
      await expect(productsPane).toBeVisible({ timeout: 30_000 })
      await expect(productsPane.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })
      await expectNamedProduct(productsPane, SEED_CHEESE_PRODUCT_NAMES[0]!, true)
      await expectNamedProduct(productsPane, SEED_MILK_PRODUCT_NAMES[0]!, false)
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })

  test('the keyboard opens the same menu with Show Products', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const tree = page.getByTestId('structure-tree')
    await expect(tree).toBeVisible({ timeout: 60_000 })
    const cheese = tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first()
    await cheese.click()
    await tree.focus()
    await page.keyboard.press('Shift+F10')
    const menu = page.getByTestId('context-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('button', { name: 'Show Products' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  })
})