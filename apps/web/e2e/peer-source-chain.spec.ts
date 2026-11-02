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

async function openSourceMenu(page: Page, target: Locator) {
  await target.getByTestId('object-table').click({ position: { x: 24, y: 24 } })
  await target.hover()
  await target.getByTestId('view-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

test.describe('peer source chains and cycles (Notion 103 PR A)', () => {
  test('A drives B drives C and a source back to A is disabled', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const workspaceId = crypto.randomUUID()
    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const childrenId = crypto.randomUUID()
    const name = `Peer chain ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.34, 0.33, 0.33],
      children: [
        { type: 'tabs', views: [articlesId], active: 0 },
        { type: 'tabs', views: [productsId], active: 0 },
        { type: 'tabs', views: [childrenId], active: 0 },
      ],
    }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `peer-chain-${workspaceId.slice(0, 8)}`,
        layout,
      },
    })
    expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

    const views = [
      {
        id: articlesId,
        type: 'object_table',
        title: 'Chain articles',
        pane: 'left',
        position: 0,
        state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: ARTICLE_TYPE_ID, type_key: 'article' },
      },
      {
        id: productsId,
        type: 'object_table',
        title: 'Chain products',
        pane: 'center',
        position: 0,
        state: {
          columns: ['number', 'name', 'status'],
          sort: 'number',
          object_type: PRODUCT_TYPE_ID,
          type_key: 'product',
          source: { kind: 'peer', viewId: articlesId, selection: 'row' },
        },
      },
      {
        id: childrenId,
        type: 'object_table',
        title: 'Chain children',
        pane: 'right',
        position: 0,
        state: {
          columns: ['number', 'name', 'status'],
          sort: 'number',
          object_type: ARTICLE_TYPE_ID,
          type_key: 'article',
          source: { kind: 'peer', viewId: productsId, selection: 'row' },
        },
      },
    ]
    for (const view of views) {
      const response = await page.request.post('/v1/views', {
        data: { ...view, workspace_id: workspaceId },
      })
      expect(response.ok(), `create view ${view.title} ${response.status()}`).toBeTruthy()
    }

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Peer chain/ }).click()
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      const children = pane(page, childrenId)
      await expect(articles.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
      await expect(children.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })

      // C follows B, and B itself follows A. With no row selected in B, C
      // explains what to do instead of showing every article.
      await expect(children.getByTestId('peer-empty-text')).toHaveText('Select a row in Chain products', {
        timeout: 30_000,
      })
      await expect(children.getByTestId('peer-show-all')).toHaveText('Show all')

      // Select in A so B gets rows, then select in B so C follows the chain.
      const articleRow = articles.getByTestId('object-row').first()
      await expect(articleRow).toBeVisible({ timeout: 30_000 })
      await articleRow.click()
      const productRow = products.getByTestId('object-row').first()
      await expect(productRow).toBeVisible({ timeout: 30_000 })
      await expect(children.getByTestId('peer-empty-text')).toHaveText('Select a row in Chain products')
      await productRow.click()
      await expect(children.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })

      // A sourcing from C would close the loop C -> B -> A. The row is shown
      // with the reason and cannot be chosen.
      const palette = await openSourceMenu(page, articles)
      const cycle = palette.locator('.hit').filter({ hasText: 'Articles from Articles' }).first()
      await expect(cycle).toBeVisible()
      await expect(cycle).toContainText('Would create a cycle')
      await expect(cycle).toHaveAttribute('aria-disabled', 'true')
      await cycle.dispatchEvent('click')
      await expect(palette).toBeVisible()
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})
