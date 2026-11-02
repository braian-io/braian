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

test.describe('peer source empty states (Notion 103 decision 6)', () => {
  test('a peer source without a selection or linked rows explains why the table is empty', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const name = `Peer empty ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.55, 0.45],
      children: [
        { type: 'tabs', views: [articlesId], active: 0 },
        { type: 'tabs', views: [productsId], active: 0 },
      ],
    }
    const createdWorkspace = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `peer-empty-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(createdWorkspace.ok(), `create workspace ${createdWorkspace.status()}`).toBeTruthy()

    const articlesView = {
      id: articlesId,
      type: 'object_table',
      title: 'Articles',
      pane: 'left',
      position: 0,
      state: {
        columns: ['number', 'name', 'status'],
        sort: 'number',
        object_type: ARTICLE_TYPE_ID,
        type_key: 'article',
        source: { kind: 'peer', viewId: productsId, selection: 'row' },
      },
    }
    const productsView = {
      id: productsId,
      type: 'object_table',
      title: 'Products',
      pane: 'right',
      position: 0,
      state: {
        columns: ['number', 'name', 'status'],
        sort: 'number',
        object_type: PRODUCT_TYPE_ID,
        type_key: 'product',
      },
    }
    for (const view of [articlesView, productsView]) {
      const response = await page.request.post('/v1/views', {
        data: { ...view, workspace_id: workspaceId },
      })
      expect(response.ok(), `create view ${view.type} ${response.status()}`).toBeTruthy()
    }

    // A fresh product with no links, so the peer source has nothing to show.
    const label = `EMPTY-${Date.now().toString().slice(-6)}`
    const createdObject = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'bread' },
        values: { number: label, name: { en: label }, status: 'draft' },
      },
    })
    expect(createdObject.ok(), `create product ${createdObject.status()}`).toBeTruthy()

    // A separate workspace for the missing source: no pending view save races
    // the stored peer source that points at a view which does not exist.
    const missingWorkspaceId = crypto.randomUUID()
    const missingArticlesId = crypto.randomUUID()
    const missingViewId = crypto.randomUUID()
    const missingName = `Missing source ${missingWorkspaceId.slice(0, 8)}`
    const createdMissing = await page.request.post('/v1/workspaces', {
      data: {
        id: missingWorkspaceId,
        name: missingName,
        locked: false,
        share_token: `missing-source-${missingWorkspaceId.slice(0, 8)}`,
        layout: { type: 'tabs', views: [missingArticlesId], active: 0 },
      },
    })
    expect(createdMissing.ok(), `create missing workspace ${createdMissing.status()}`).toBeTruthy()
    const missingView = await page.request.post('/v1/views', {
      data: {
        id: missingArticlesId,
        workspace_id: missingWorkspaceId,
        type: 'object_table',
        title: 'Articles',
        pane: 'center',
        position: 0,
        state: {
          columns: ['number', 'name', 'status'],
          sort: 'number',
          object_type: ARTICLE_TYPE_ID,
          type_key: 'article',
          source: { kind: 'peer', viewId: missingViewId, selection: 'row' },
        },
      },
    })
    expect(missingView.ok(), `create missing view ${missingView.status()}`).toBeTruthy()

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Peer empty/ }).click()
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      await expect(articles.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })

      // 1. The source view has no selected row.
      await expect(articles.getByTestId('peer-linked-to')).toHaveText('Linked to: Products', { timeout: 30_000 })
      await expect(articles.getByTestId('peer-empty-text')).toHaveText('Select a row in Products', { timeout: 30_000 })

      // 2. A selected source row without linked articles.
      await products.getByTestId('quick-filter').first().fill(label)
      const row = products.getByTestId('object-row').filter({ hasText: label }).first()
      await expect(row).toBeVisible({ timeout: 30_000 })
      await row.click()
      await expect(articles.getByTestId('peer-empty-text')).toHaveText(`No linked Articles for ${label}`, {
        timeout: 30_000,
      })

      await expect(articles.getByTestId('peer-show-all')).toHaveText('Show all')
      await articles.getByTestId('peer-show-all').click()
      await expect(articles.getByTestId('view-source-label')).toHaveText('All Articles', { timeout: 30_000 })
      await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })

      // 3. A stored peer source that points at a view which no longer exists.
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Missing source/ }).click()
      const missingArticles = pane(page, missingArticlesId)
      await expect(missingArticles.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
      await expect(missingArticles.getByTestId('peer-empty-text')).toHaveText('Source no longer exists', {
        timeout: 30_000,
      })
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
      await page.request.delete(`/v1/workspaces/${missingWorkspaceId}`)
    }
  })
})
