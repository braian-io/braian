import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'
const ARTICLE_TYPE_ID = '018f0000-0000-7000-8000-000000000201'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

function pane(page: Page, viewId: string): Locator {
  return page.locator(`[data-pane="${viewId}"]`)
}

async function chooseSource(page: Page, target: Locator, title: string) {
  // Focus the target pane first: the runner falls back to the focused table.
  await target.getByTestId('object-table').first().click({ position: { x: 24, y: 24 } })
  await target.hover()
  await target.getByTestId('view-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.locator('.hit').filter({ hasText: title }).first().click()
  await expect(palette).toHaveCount(0)
}

test.describe('peer source follows another view (Notion 103 PR 2)', () => {
  test('tree node and table row from another view drive the target rows', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const name = `Peer source ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.22, 0.78],
      children: [
        { type: 'tabs', views: [treeId], active: 0 },
        {
          type: 'split',
          dir: 'horizontal',
          ratios: [0.55, 0.45],
          children: [
            { type: 'tabs', views: [articlesId], active: 0 },
            { type: 'tabs', views: [productsId], active: 0 },
          ],
        },
      ],
    }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `peer-source-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

    for (const view of [
      { id: treeId, type: 'structure_tree', title: 'Food', pane: 'left', position: 0, state: { expanded: ['dairy', 'beverages'] } },
      {
        id: articlesId,
        type: 'object_table',
        title: 'Articles',
        pane: 'center',
        position: 0,
        state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: ARTICLE_TYPE_ID, type_key: 'article' },
      },
      {
        id: productsId,
        type: 'object_table',
        title: 'Products',
        pane: 'right',
        position: 0,
        state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: PRODUCT_TYPE_ID, type_key: 'product' },
      },
    ]) {
      const response = await page.request.post('/v1/views', {
        data: { ...view, workspace_id: workspaceId },
      })
      expect(response.ok(), `create view ${view.type} ${response.status()}`).toBeTruthy()
    }

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Peer source/ }).click()
      const tree = pane(page, treeId)
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })

      // The source is a tree node in another view. Pick Cheese first, then use it
      // as the Articles table's source.
      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await articles.getByTestId('object-table').first().click({ position: { x: 24, y: 24 } })
      await chooseSource(page, articles, 'Articles from Food')
      const label = articles.getByTestId('view-source-label')
      await expect(label).toContainText('Food › Cheese', { timeout: 30_000 })
      const cheeseKey = await articles.getByTestId('object-row').first().innerText()

      // Changing the node in the source view updates the target rows live.
      await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
      await expect(label).toContainText('Food › Milk', { timeout: 30_000 })
      await expect
        .poll(async () => articles.getByTestId('object-row').first().innerText(), { timeout: 30_000 })
        .not.toBe(cheeseKey)

      // Now the source is a selected row in another view: a Product linked to
      // Articles through product_articles.
      const firstProduct = products.getByTestId('object-row').first()
      await firstProduct.click()
      await expect(firstProduct).toHaveAttribute('aria-selected', 'true')
      await chooseSource(page, articles, 'Articles from Products')
      await expect(label).toContainText('Products ›', { timeout: 30_000 })
      const firstLinked = await articles.getByTestId('object-row').first().innerText()

      // Selecting another source row swaps the linked target rows.
      await products.getByTestId('object-row').nth(1).click()
      await expect
        .poll(async () => articles.getByTestId('object-row').first().innerText(), { timeout: 30_000 })
        .not.toBe(firstLinked)
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})
