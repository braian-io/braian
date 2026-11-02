import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

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
  await target.getByTestId('object-table').click({ position: { x: 24, y: 24 } })
  await target.hover()
  await target.getByTestId('view-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.locator('.hit').filter({ hasText: title }).first().click()
  await expect(palette).toHaveCount(0)
}

test.describe('explicit All source (row 103)', () => {
  test('an explicit All articles source stops following tree nodes in another view', async ({ page }) => {
    await login(page)

    const workspaceId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const articlesId = crypto.randomUUID()
    const name = `All source ${workspaceId.slice(0, 8)}`
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.22, 0.78],
      children: [
        { type: 'tabs', views: [treeId], active: 0 },
        { type: 'tabs', views: [articlesId], active: 0 },
      ],
    }
    const created = await page.request.post('/v1/workspaces', {
      data: {
        id: workspaceId,
        name,
        locked: false,
        share_token: `source-all-${workspaceId.slice(0, 8)}`,
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
    ]) {
      const response = await page.request.post('/v1/views', {
        data: { ...view, workspace_id: workspaceId },
      })
      expect(response.ok(), `create view ${view.type} ${response.status()}`).toBeTruthy()
    }

    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /All source/ }).click()
      const tree = pane(page, treeId)
      const articles = pane(page, articlesId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible()
      await expect(articles.getByTestId('object-table')).toBeVisible()
      await expect(articles.getByTestId('object-row').first()).toBeVisible()

      const allRows = await articles.getByTestId('object-row').count()

      // Clicking a tree node first makes the table follow it implicitly.
      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await page.waitForTimeout(400)
      await expect.poll(async () => articles.getByTestId('object-row').count()).not.toBe(allRows)

      // An explicit All articles source clears that implicit follow.
      await chooseSource(page, articles, 'All Articles')
      const label = articles.getByTestId('view-source-label')
      await expect(label).toHaveText('All Articles')
      await expect.poll(async () => articles.getByTestId('object-row').count()).toBe(allRows)

      // A later click in the tree must not narrow the table again.
      await tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first().click()
      await page.waitForTimeout(400)
      expect(await articles.getByTestId('object-row').count()).toBe(allRows)
      await expect(articles.getByTestId('object-row').filter({ hasText: 'ART-OAT-1L' })).toBeVisible()

      // The current source is marked when the submenu opens again.
      await articles.getByTestId('object-table').click({ position: { x: 24, y: 24 } })
      await articles.hover()
      await articles.getByTestId('view-menu').click()
      await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
      const palette = page.getByTestId('command-palette')
      await expect(palette).toBeVisible()
      const all = palette.locator('.hit').filter({ hasText: 'All Articles' }).first()
      await expect(all).toBeVisible()
      await expect(all.locator('.meta-chip').filter({ hasText: 'Current' })).toBeVisible()
    } finally {
      await page.request.delete(`/v1/workspaces/${workspaceId}`)
    }
  })
})
