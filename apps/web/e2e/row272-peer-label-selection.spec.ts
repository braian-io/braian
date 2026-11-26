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
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
}

function pane(page: Page, viewId: string): Locator {
  return page.locator(`[data-pane="${viewId}"]`)
}

async function createWorkspace(
  page: Page,
  layout: Record<string, unknown>,
  views: Array<Record<string, unknown>>,
) {
  const workspaceId = crypto.randomUUID()
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name: `Row272 ${workspaceId.slice(0, 8)}`,
      locked: false,
      share_token: `row272-${workspaceId.slice(0, 8)}`,
      layout,
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()
  for (const view of views) {
    const response = await page.request.post('/v1/views', {
      data: { ...view, workspace_id: workspaceId },
    })
    expect(response.ok(), `create view ${String(view.title)} ${response.status()}`).toBeTruthy()
  }
  return workspaceId
}

test.describe('peer-linked label selections (Notion row 272)', () => {
  test('Organic applies in peer-linked Articles; Cheese chip is inert', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.5, 0.5],
      children: [
        { type: 'tabs', views: [productsId], active: 0 },
        { type: 'tabs', views: [articlesId], active: 0 },
      ],
    }
    const workspaceId = await createWorkspace(page, layout, [
      {
        id: productsId,
        type: 'object_table',
        title: 'Products',
        pane: 'center',
        position: 0,
        state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: PRODUCT_TYPE_ID, type_key: 'product' },
      },
      {
        id: articlesId,
        type: 'object_table',
        title: 'Articles',
        pane: 'center',
        position: 0,
        state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: ARTICLE_TYPE_ID, type_key: 'article' },
      },
    ])

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Row272/ }).click()
      const products = pane(page, productsId)
      const articles = pane(page, articlesId)
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
      await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

      await products.getByTestId('object-row').first().click()
      await articles.hover()
      await articles.getByTestId('view-menu').click()
      await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
      const palette = page.getByTestId('command-palette')
      await expect(palette).toBeVisible()
      await palette.locator('.hit').filter({ hasText: 'Articles from Products' }).first().click()
      await expect(articles.getByTestId('peer-linked-to')).toHaveText('Linked to: Products', { timeout: 30_000 })

      const peerClear = articles.getByTestId('view-source-label')
      await expect(peerClear).toHaveAttribute(
        'aria-label',
        'Clear data source and show All Articles',
      )

      const linkedBefore = await articles.getByTestId('object-row').count()
      expect(linkedBefore).toBeGreaterThan(0)

      const cheese = articles.getByTestId('assortment').filter({ hasText: 'Cheese' })
      await cheese.click()
      await expect(cheese).not.toHaveClass(/\bon\b/)
      expect(await articles.getByTestId('object-row').count()).toBe(linkedBefore)

      const organic = articles.getByTestId('assortment').filter({ hasText: 'Organic' })
      await organic.click()
      await expect(organic).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect
        .poll(async () => articles.getByTestId('object-row').count(), { timeout: 30_000 })
        .toBeLessThan(linkedBefore)
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })

  test('group chip on explicit All shows error and leaves Cheese off when view save fails', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const layout = { type: 'tabs', views: [productsId], active: 0 }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name: `Row272b ${workspaceId.slice(0, 8)}`,
        locked: false,
        share_token: `row272b-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(created.ok()).toBeTruthy()
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
      const response = await page.request.post('/v1/views', { data: { ...view, workspace_id: workspaceId } })
      expect(response.ok()).toBeTruthy()
    }

    let failViewSave = false
    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Row272b/ }).click()
      const products = pane(page, productsId)
      await products.getByTestId('object-table').first().click({ position: { x: 24, y: 24 } })
      await products.hover()
      await products.getByTestId('view-menu').click()
      await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
      await page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All Products' }).first().click()
      await expect(products.getByTestId('view-source-label')).toHaveText('All Products')

      await page.keyboard.press('Control+k')
      await page.getByTestId('command-palette').getByTestId('palette-input').fill('Open view')
      await page.keyboard.press('Enter')
      await page.getByTestId('command-palette').getByTestId('palette-input').fill('Food')
      await page.getByRole('option', { name: /^Food/ }).first().click()
      await expect(pane(page, treeId).getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })

      await page.route('**/v1/views', async (route) => {
        if (failViewSave && route.request().method() === 'POST') {
          failViewSave = false
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'save failed' }) })
          return
        }
        await route.continue()
      })

      const cheese = products.getByTestId('assortment').filter({ hasText: 'Cheese' })
      failViewSave = true
      await cheese.click()
      await expect(page.getByTestId('filter-setup-error')).toContainText('save failed', { timeout: 30_000 })
      await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
      await expect(cheese).not.toHaveClass(/\bon\b/)
      await expect(products.getByTestId('view-source-label')).toContainText('Food')
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})