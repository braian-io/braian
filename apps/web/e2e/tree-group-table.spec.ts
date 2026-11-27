import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { SEED_CHEESE_PRODUCT_NAMES, SEED_JUICE_PRODUCT_NAME, SEED_MILK_PRODUCT_NAMES } from './seed-product-names'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'
const ARTICLE_TYPE_ID = '018f0000-0000-7000-8000-000000000201'
const PRODUCTS_WORKSPACE_ID = '018f2000-0000-7000-8000-000000000003'
const PRODUCTS_TREE_ID = '018f2000-0000-7000-8000-000000000301'
const PRODUCTS_TABLE_ID = '018f2000-0000-7000-8000-000000000302'

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
}

async function viewState(page: Page, workspaceId: string, viewId: string) {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as {
    views?: Array<{ id?: string; state?: { source?: { kind?: string; viewId?: string; selection?: string }; selected_group?: string } }>
  }
  return body.views?.find((view) => view.id === viewId)?.state
}

test.describe('tree group filters the products table', () => {
  test('a layout that already contains the tree follows the selected group, including after reload', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const articlesId = crypto.randomUUID()
    const name = `Tree group ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.22, 0.78],
      children: [
        { type: 'tabs', views: [treeId], active: 0 },
        {
          type: 'split',
          dir: 'horizontal',
          ratios: [0.6, 0.4],
          children: [
            { type: 'tabs', views: [productsId], active: 0 },
            { type: 'tabs', views: [articlesId], active: 0 },
          ],
        },
      ],
    }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `tree-group-${workspaceId.slice(0, 8)}`,
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
      {
        id: articlesId,
        type: 'object_table',
        title: 'Articles',
        pane: 'center',
        position: 1,
        state: {
          columns: ['number', 'name', 'status'],
          sort: 'number',
          object_type: ARTICLE_TYPE_ID,
          type_key: 'article',
          source: { kind: 'peer', viewId: productsId, selection: 'row' },
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
      await page.locator('nav.tabs').getByRole('button', { name: /Tree group/ }).click()
      const tree = pane(page, treeId)
      const products = pane(page, productsId)
      const articles = pane(page, articlesId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })
      await expect.poll(async () => (await viewState(page, workspaceId, productsId))?.source).toEqual({
        kind: 'peer',
        viewId: treeId,
        selection: 'node',
      })
      await expect.poll(async () => (await viewState(page, workspaceId, articlesId))?.source).toEqual({
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
      })
      await expect(articles.getByTestId('view-source-label')).toContainText('Products')

      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_CHEESE_PRODUCT_NAMES.length)
      for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(1)
      }
      for (const productName of SEED_MILK_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(0)
      }

      await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
      await expect(products.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
      await expect.poll(async () => (await viewState(page, workspaceId, treeId))?.selected_group).toBe('food:milk')
      await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_MILK_PRODUCT_NAMES.length)
      for (const productName of SEED_MILK_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(1)
      }
      for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
        await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(0)
      }

      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Tree group/ }).click()
      const productsAfter = pane(page, productsId)
      await expect(productsAfter.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
      await expect.poll(async () => productsAfter.getByTestId('object-row').count()).toBe(SEED_MILK_PRODUCT_NAMES.length)
      for (const productName of SEED_MILK_PRODUCT_NAMES) {
        await expect(productsAfter.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(1)
      }
      for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
        await expect(productsAfter.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(0)
      }
      await expect.poll(async () => (await viewState(page, workspaceId, articlesId))?.source).toEqual({
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
      })

      await tree.getByRole('treeitem', { name: 'Dairy & eggs', exact: true }).click()
      await expect(productsAfter.getByTestId('view-source-label')).toContainText('Food › Dairy & eggs', { timeout: 30_000 })
      await expectNamedProduct(productsAfter, 'Mature cheddar', true)
      await expectNamedProduct(productsAfter, 'Semi-skimmed milk 18', true)
      await expectNamedProduct(productsAfter, SEED_JUICE_PRODUCT_NAME, false)
      await productsAfter.getByTestId('quick-filter').fill('')
      await expect.poll(async () => (await viewState(page, workspaceId, treeId))?.selected_group).toBe('food:dairy')

      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Tree group/ }).click()
      const productsDairy = pane(page, productsId)
      const treeDairy = pane(page, treeId)
      await expect(productsDairy.getByTestId('view-source-label')).toContainText('Food › Dairy & eggs', { timeout: 30_000 })
      await expectNamedProduct(productsDairy, 'Mature cheddar', true)
      await expectNamedProduct(productsDairy, 'Semi-skimmed milk 18', true)
      await expectNamedProduct(productsDairy, SEED_JUICE_PRODUCT_NAME, false)

      await treeDairy.getByTestId('structure-root').click()
      await expect(productsDairy.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })
      await expect(productsDairy.getByTestId('view-source-label')).not.toContainText('Food › Food')
      await expectNamedProduct(productsDairy, 'Mature cheddar', true)
      await expectNamedProduct(productsDairy, SEED_JUICE_PRODUCT_NAME, true)
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })

  test('the default Products workspace filters by the Food tree and keeps it after reload', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
    const me = await page.request.get('/v1/me')
    const userId = ((await me.json()) as { user_id?: string }).user_id
    if (userId) {
      await page.evaluate((key) => localStorage.removeItem(key), `braian.layout.${userId}.default.${PRODUCTS_WORKSPACE_ID}`)
    }
    const deleted = await page.request.delete(`/v1/workspaces/${PRODUCTS_WORKSPACE_ID}/state?environment=default`)
    expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
    await page.reload()
    await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const tree = pane(page, PRODUCTS_TREE_ID)
    const products = pane(page, PRODUCTS_TABLE_ID)
    await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
    await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })

    await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
    await expect(products.getByTestId('view-source-label')).toContainText('Food › Cheese', { timeout: 30_000 })
    await expect.poll(async () => products.getByTestId('object-row').count()).toBe(SEED_CHEESE_PRODUCT_NAMES.length)
    for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
      await expect(products.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(1)
    }

    await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
    await expect.poll(async () => (await viewState(page, PRODUCTS_WORKSPACE_ID, PRODUCTS_TREE_ID))?.selected_group).toBe('food:milk')
    await page.reload()
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const productsAfter = pane(page, PRODUCTS_TABLE_ID)
    await expect(productsAfter.getByTestId('view-source-label')).toContainText('Food › Milk', { timeout: 30_000 })
    await expect.poll(async () => productsAfter.getByTestId('object-row').count()).toBe(SEED_MILK_PRODUCT_NAMES.length)
    for (const productName of SEED_MILK_PRODUCT_NAMES) {
      await expect(productsAfter.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(1)
    }
    for (const productName of SEED_CHEESE_PRODUCT_NAMES) {
      await expect(productsAfter.getByTestId('object-row').filter({ hasText: productName })).toHaveCount(0)
    }

    const treeAfter = pane(page, PRODUCTS_TREE_ID)
    await treeAfter.getByRole('treeitem', { name: 'Dairy & eggs', exact: true }).click()
    await expect(productsAfter.getByTestId('view-source-label')).toContainText('Food › Dairy & eggs', { timeout: 30_000 })
    await expectNamedProduct(productsAfter, 'Mature cheddar', true)
    await expectNamedProduct(productsAfter, 'Semi-skimmed milk 18', true)
    await expectNamedProduct(productsAfter, SEED_JUICE_PRODUCT_NAME, false)
    await productsAfter.getByTestId('quick-filter').fill('')
    await expect.poll(async () => (await viewState(page, PRODUCTS_WORKSPACE_ID, PRODUCTS_TREE_ID))?.selected_group).toBe('food:dairy')

    await page.reload()
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const productsDairy = pane(page, PRODUCTS_TABLE_ID)
    await expect(productsDairy.getByTestId('view-source-label')).toContainText('Food › Dairy & eggs', { timeout: 30_000 })
    await expectNamedProduct(productsDairy, 'Mature cheddar', true)
    await expectNamedProduct(productsDairy, 'Semi-skimmed milk 18', true)
    await expectNamedProduct(productsDairy, SEED_JUICE_PRODUCT_NAME, false)
  })
})

test.afterEach(async ({ page }) => {
  const response = await page.request.get(`/v1/workspaces/${PRODUCTS_WORKSPACE_ID}`)
  if (!response.ok()) return
  const body = (await response.json()) as {
    views?: Array<{
      id?: string
      type?: string
      title?: string
      pane?: string
      position?: number
      state?: Record<string, unknown>
    }>
  }
  const view = body.views?.find((item) => item.id === PRODUCTS_TREE_ID)
  if (!view?.state || view.state.selected_group == null) return
  await page.request.post('/v1/views', {
    data: {
      id: view.id,
      workspace_id: PRODUCTS_WORKSPACE_ID,
      type: view.type,
      title: view.title,
      pane: view.pane ?? 'left',
      position: view.position ?? 0,
      state: { ...view.state, selected_group: null },
    },
  })
})
