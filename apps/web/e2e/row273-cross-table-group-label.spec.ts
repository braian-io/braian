import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'
const ARTICLE_TYPE_ID = '018f0000-0000-7000-8000-000000000201'

type SourceState = { kind?: string; viewId?: string; selection?: string; linkType?: string }

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

async function sourceOf(page: Page, workspaceId: string, viewId: string): Promise<SourceState | undefined> {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(response.ok(), `workspace ${response.status()}`).toBeTruthy()
  const body = (await response.json()) as {
    views: Array<{ id: string; state?: { source?: SourceState } }>
  }
  return body.views.find((view) => view.id === viewId)?.state?.source
}

async function createSelection(page: Page, name: string) {
  const response = await page.request.post('/v1/assortments', {
    data: {
      name,
      type: 'article',
      kind: 'manual',
      query: { group: 'food:cheese', labels: 'organic_eu' },
    },
  })
  const body = await response.text()
  expect(response.ok(), `create selection ${response.status()} ${body}`).toBeTruthy()
  const saved = JSON.parse(body) as { id?: string }
  expect(saved.id).toBeTruthy()
  return String(saved.id)
}

async function openSelection(page: Page, host: Locator, name: string) {
  await host.getByTestId('object-table').first().click({ position: { x: 24, y: 24 } })
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('Selections')
  await palette.locator('.hit').filter({ hasText: /^Selections/ }).first().click()
  await palette.getByTestId('palette-input').fill(name)
  await palette.locator('.hit').filter({ hasText: name }).first().click()
  await expect(palette).toHaveCount(0)
}

function watchSelectionSearches(page: Page) {
  const filters: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' || !request.url().includes('/v1/search')) return
    const filter = new URL(request.url()).searchParams.get('filter') ?? ''
    if (filter.includes('organic_eu') && filter.includes('groups:=')) filters.push(filter)
  })
  return filters
}

async function buildWorkspace(
  page: Page,
  name: string,
  locked: boolean,
) {
  const workspaceId = crypto.randomUUID()
  const treeId = crypto.randomUUID()
  const productsId = crypto.randomUUID()
  const peerId = crypto.randomUUID()
  const allId = crypto.randomUUID()
  const layout = {
    type: 'split',
    dir: 'horizontal',
    ratios: [0.22, 0.78],
    children: [
      { type: 'tabs', views: [treeId], active: 0 },
      {
        type: 'split',
        dir: 'horizontal',
        ratios: [0.34, 0.66],
        children: [
          { type: 'tabs', views: [productsId], active: 0 },
          {
            type: 'split',
            dir: 'horizontal',
            ratios: [0.5, 0.5],
            children: [
              { type: 'tabs', views: [peerId], active: 0 },
              { type: 'tabs', views: [allId], active: 0 },
            ],
          },
        ],
      },
    ],
  }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name,
      locked,
      share_token: `row273-${workspaceId.slice(0, 8)}`,
      layout,
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()
  const views = [
    { id: treeId, type: 'structure_tree', title: 'Food', pane: 'left', position: 0, state: { expanded: ['dairy'] } },
    {
      id: productsId,
      type: 'object_table',
      title: 'Products',
      pane: 'center',
      position: 0,
      state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: PRODUCT_TYPE_ID, type_key: 'product' },
    },
    {
      id: peerId,
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
    {
      id: allId,
      type: 'object_table',
      title: 'All articles',
      pane: 'center',
      position: 2,
      state: {
        columns: ['number', 'name', 'status'],
        sort: 'number',
        object_type: ARTICLE_TYPE_ID,
        type_key: 'article',
        source: { kind: 'all' },
      },
    },
  ]
  for (const view of views) {
    const response = await page.request.post('/v1/views', { data: { ...view, workspace_id: workspaceId } })
    expect(response.ok(), `create view ${view.title} ${response.status()}`).toBeTruthy()
  }
  return { workspaceId, treeId, productsId, peerId, allId }
}

test.describe('cross-table group and label selections (Notion row 273)', () => {
  test('K1 palette apply lights the chip on a peer table and on explicit All', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const selectionName = `Cheese organic ${crypto.randomUUID().slice(0, 8)}`
    const selectionId = await createSelection(page, selectionName)
    const ids = await buildWorkspace(page, `Row273 ${selectionName.slice(-8)}`, false)
    const filters = watchSelectionSearches(page)
    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Row273/ }).click()
      const tree = pane(page, ids.treeId)
      const products = pane(page, ids.productsId)
      const peer = pane(page, ids.peerId)
      const all = pane(page, ids.allId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
      await products.getByTestId('object-row').first().click()
      await expect(peer.getByTestId('peer-linked-to')).toHaveText('Linked to: Products', { timeout: 30_000 })
      await expect(all.getByTestId('view-source-label')).toHaveText('All Articles')
      const milk = tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first()
      await milk.click()
      await expect(milk).toHaveAttribute('aria-selected', 'true')

      const peerChip = peer.getByTestId('assortment').filter({ hasText: selectionName })
      const allChip = all.getByTestId('assortment').filter({ hasText: selectionName })
      await expect(peerChip).toBeVisible({ timeout: 30_000 })
      await expect(allChip).toBeVisible()
      await openSelection(page, all, selectionName)

      await expect(peerChip).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect(allChip).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect(peerChip).toHaveAttribute('aria-pressed', 'true')
      await expect(allChip).toHaveAttribute('aria-pressed', 'true')
      await expect(milk).toHaveAttribute('aria-selected', 'true')
      await expect(peer.getByTestId('peer-linked-to')).toHaveText('Linked to: Products')
      await expect(all.getByTestId('view-source-label')).toHaveText('All Articles')
      await expect.poll(() => filters.some((filter) => filter.includes('groups:=food:cheese') && filter.includes('organic_eu'))).toBe(true)
      expect(await sourceOf(page, ids.workspaceId, ids.peerId)).toMatchObject({
        kind: 'peer',
        viewId: ids.productsId,
        selection: 'row',
      })
      expect(await sourceOf(page, ids.workspaceId, ids.allId)).toEqual({ kind: 'all' })
    } finally {
      await page.request.delete(`/v1/assortments/${selectionId}`)
      await page.request.delete(`/v1/workspaces/${ids.workspaceId}`)
    }
  })

  test('K1 click applies group plus label locally on peer and explicit All', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const selectionName = `Cheese organic ${crypto.randomUUID().slice(0, 8)}`
    const selectionId = await createSelection(page, selectionName)
    const ids = await buildWorkspace(page, `Row273c ${selectionName.slice(-8)}`, false)
    const filters = watchSelectionSearches(page)
    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Row273c/ }).click()
      const tree = pane(page, ids.treeId)
      const products = pane(page, ids.productsId)
      const peer = pane(page, ids.peerId)
      const all = pane(page, ids.allId)
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
      await products.getByTestId('object-row').first().click()
      await expect(peer.getByTestId('peer-linked-to')).toHaveText('Linked to: Products', { timeout: 30_000 })
      const milk = tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first()
      await milk.click()
      await expect(milk).toHaveAttribute('aria-selected', 'true')

      const peerChip = peer.getByTestId('assortment').filter({ hasText: selectionName })
      const allChip = all.getByTestId('assortment').filter({ hasText: selectionName })
      await peerChip.click()
      await allChip.click()
      await expect(peerChip).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect(allChip).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect(milk).toHaveAttribute('aria-selected', 'true')
      await expect(peer.getByTestId('peer-linked-to')).toHaveText('Linked to: Products')
      await expect(all.getByTestId('view-source-label')).toHaveText('All Articles')
      await expect.poll(() => filters.filter((filter) => filter.includes('groups:=food:cheese') && filter.includes('organic_eu')).length).toBeGreaterThan(0)
      expect(await sourceOf(page, ids.workspaceId, ids.allId)).toEqual({ kind: 'all' })
      expect(await sourceOf(page, ids.workspaceId, ids.peerId)).toMatchObject({ kind: 'peer', viewId: ids.productsId })
    } finally {
      await page.request.delete(`/v1/assortments/${selectionId}`)
      await page.request.delete(`/v1/workspaces/${ids.workspaceId}`)
    }
  })

  test('K3 locked workspace keeps the global group', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const selectionName = `Cheese organic ${crypto.randomUUID().slice(0, 8)}`
    const selectionId = await createSelection(page, selectionName)
    const ids = await buildWorkspace(page, `Row273k ${selectionName.slice(-8)}`, true)
    try {
      await page.reload()
      await page.locator('nav.tabs').getByRole('button', { name: /Row273k/ }).click()
      const tree = pane(page, ids.treeId)
      const products = pane(page, ids.productsId)
      const peer = pane(page, ids.peerId)
      const all = pane(page, ids.allId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
      await products.getByTestId('object-row').first().click()
      await expect(peer.getByTestId('peer-linked-to')).toHaveText('Linked to: Products', { timeout: 30_000 })
      const milk = tree.getByRole('treeitem').filter({ hasText: 'Milk' }).first()
      await milk.click()
      await expect(milk).toHaveAttribute('aria-selected', 'true')
      const cheese = tree.getByRole('treeitem').filter({ hasText: /^Cheese$/ }).first()

      await openSelection(page, all, selectionName)
      const peerChip = peer.getByTestId('assortment').filter({ hasText: selectionName })
      const allChip = all.getByTestId('assortment').filter({ hasText: selectionName })
      await expect(peerChip).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect(allChip).toHaveClass(/\bon\b/, { timeout: 30_000 })
      await expect(milk).toHaveAttribute('aria-selected', 'true')
      await expect(cheese).toHaveAttribute('aria-selected', 'false')
      expect(await sourceOf(page, ids.workspaceId, ids.allId)).toEqual({ kind: 'all' })
      expect(await sourceOf(page, ids.workspaceId, ids.peerId)).toMatchObject({ kind: 'peer', viewId: ids.productsId })
    } finally {
      await page.request.delete(`/v1/assortments/${selectionId}`)
      await page.request.delete(`/v1/workspaces/${ids.workspaceId}`)
    }
  })
})
