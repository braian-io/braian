import { expect, test, type Page } from '@playwright/test'
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

/** Same shape as typeWorkspaceTemplate() for the seeded Products type. */
async function createPeerWorkspace(page: Page) {
  const workspaceId = crypto.randomUUID()
  const name = `Peer template ${workspaceId.slice(0, 8)}`
  const shareToken = `user-e2e-${workspaceId.slice(0, 8)}`
  const views = Array.from({ length: 8 }, () => crypto.randomUUID())
  const [tree, selections, main, peer, detail, graph, history, attributes] = views
  const layout = {
    type: 'split',
    dir: 'horizontal',
    ratios: [0.22, 0.78],
    children: [
      { type: 'tabs', views: [tree, selections], active: 0 },
      {
        type: 'split',
        dir: 'horizontal',
        ratios: [0.5, 0.5],
        children: [
          { type: 'tabs', views: [main], active: 0 },
          {
            type: 'split',
            dir: 'horizontal',
            ratios: [0.5, 0.5],
            children: [
              { type: 'tabs', views: [peer], active: 0 },
              { type: 'tabs', views: [detail, graph, history, attributes], active: 0 },
            ],
          },
        ],
      },
    ],
  }
  const columns = ['number', 'name', 'type', 'status']
  const created = await page.request.post('/v1/workspaces', {
    data: { id: workspaceId, name, locked: false, share_token: shareToken, layout },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

  for (const view of [
    { id: tree, type: 'structure_tree', title: 'Structure', pane: 'left', position: 0, state: {} },
    { id: selections, type: 'assortment_list', title: 'Selections', pane: 'left', position: 1, state: {} },
    {
      id: main,
      type: 'object_table',
      title: 'Products',
      pane: 'main',
      position: 2,
      state: { columns, sort: 'number', object_type: PRODUCT_TYPE_ID, type_key: 'product' },
    },
    {
      id: peer,
      type: 'object_table',
      title: 'Articles',
      pane: 'main',
      position: 3,
      state: {
        columns,
        sort: 'number',
        object_type: ARTICLE_TYPE_ID,
        type_key: 'article',
        source: { kind: 'peer', viewId: main, selection: 'row' },
      },
    },
    { id: detail, type: 'object_detail', title: 'Detail', pane: 'main', position: 4, state: { language: 'en' } },
    { id: graph, type: 'graph', title: 'Graph', pane: 'main', position: 5, state: {} },
    { id: history, type: 'history', title: 'History', pane: 'main', position: 6, state: {} },
    { id: attributes, type: 'class_attributes', title: 'Group attributes', pane: 'main', position: 7, state: {} },
  ]) {
    const response = await page.request.post('/v1/views', {
      data: { ...view, workspace_id: workspaceId },
    })
    expect(response.ok(), `create view ${view.type} ${response.status()}`).toBeTruthy()
  }
  return { workspaceId, name }
}

test('type template adds a peer table that follows the selected main row', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const own = await createPeerWorkspace(page)

  try {
    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })

    const tab = page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${own.name}`) })
    await tab.click()
    await expect(tab).toHaveClass(/active/)

    const mainPane = page.locator('section.pane').filter({
      has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }),
    })
    const peerPane = page.locator('section.pane').filter({
      has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Articles' }),
    })
    await expect(mainPane.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
    await expect(peerPane.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })

    const firstRow = mainPane.getByTestId('object-row').first()
    await expect(firstRow).toBeVisible({ timeout: 60_000 })
    await firstRow.click()
    await expect(firstRow).toHaveAttribute('aria-selected', 'true')

    await expect(peerPane.getByTestId('view-source-label')).toContainText('Products', {
      timeout: 30_000,
    })
    await expect(peerPane.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })
  } finally {
    const deleted = await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
  }
})
