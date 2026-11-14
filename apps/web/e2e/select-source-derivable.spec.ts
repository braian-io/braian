import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'
const ARTICLE_TYPE_ID = '018f0000-0000-7000-8000-000000000201'
const SUPPLIER_TYPE_ID = '018f0000-0000-7000-8000-000000000202'
const columns = ['number', 'name', 'status']

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

function objectTable(id: string, title: string, typeId: string, typeKey: string) {
  return {
    id,
    type: 'object_table',
    title,
    pane: 'center',
    position: 0,
    state: { columns, sort: 'number', object_type: typeId, type_key: typeKey },
  }
}

function foodTree(id: string) {
  return {
    id,
    type: 'structure_tree',
    title: 'Food',
    pane: 'left',
    position: 0,
    state: { expanded: ['dairy', 'beverages'] },
  }
}

async function createWorkspace(
  page: Page,
  name: string,
  layout: Record<string, unknown>,
  views: Array<Record<string, unknown>>,
) {
  const workspaceId = crypto.randomUUID()
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name: `${name} ${workspaceId.slice(0, 8)}`,
      locked: false,
      share_token: `${name.toLowerCase().replace(/\s+/g, '-')}-${workspaceId.slice(0, 8)}`,
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
  return { workspaceId, name: `${name} ${workspaceId.slice(0, 8)}` }
}

function splitLayout(viewIds: string[]) {
  return {
    type: 'split',
    dir: 'horizontal',
    ratios: viewIds.map(() => 1 / viewIds.length),
    children: viewIds.map((id) => ({ type: 'tabs', views: [id], active: 0 })),
  }
}

async function openWorkspace(page: Page, name: RegExp) {
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name }).click()
}

async function waitForRows(target: Locator, timeout = 30_000) {
  await expect
    .poll(async () => target.getByTestId('object-row').count(), {
      message: 'object table rows',
      timeout,
    })
    .toBeGreaterThan(0)
}

async function openSourceMenu(page: Page, target: Locator) {
  await target.hover()
  await target.getByTestId('view-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

async function menuTitles(palette: Locator) {
  return palette.locator('.hit-title').allInnerTexts()
}

async function chooseTitle(page: Page, target: Locator, title: string) {
  const palette = await openSourceMenu(page, target)
  await palette.locator('.hit').filter({ hasText: title }).first().click()
  await expect(palette).toHaveCount(0)
}

async function shot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name)
  await page.screenshot({ path, fullPage: true })
  const extra = process.env.BRAIAN_ROW103_SHOTS
  if (extra) {
    mkdirSync(extra, { recursive: true })
    copyFileSync(path, join(extra, name))
  }
}

async function expectRowsOrEmpty(target: Locator) {
  await expect
    .poll(async () => {
      if (await target.getByTestId('object-row').count()) return 'rows'
      if (await target.getByTestId('peer-empty-text').count()) return 'empty'
      return 'blank'
    }, { message: 'rows or the documented empty state', timeout: 20_000 })
    .not.toBe('blank')
}

type SourceState = { kind?: string; viewId?: string; selection?: string; linkType?: string }

async function waitForSourceState(
  page: Page,
  workspaceId: string,
  viewId: string,
  expected: SourceState | undefined,
  timeout = 30_000,
) {
  await expect
    .poll(async () => {
      const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
      if (!response.ok()) return undefined
      const body = (await response.json()) as {
        views: Array<{ id: string; state?: { source?: SourceState } }>
      }
      return body.views.find((view) => view.id === viewId)?.state?.source
    }, { message: `persisted source state for ${viewId}`, timeout })
    .toEqual(expected)
}

test.describe('Select source lists every derivable source (row 103 follow-up)', () => {
  test('Articles menu lists Article sources, each yields rows or an empty state, and reload keeps it', async ({ page }, info) => {
    test.setTimeout(240_000)
    await login(page)

    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const suppliersId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const own = await createWorkspace(
      page,
      'Derivable articles',
      splitLayout([treeId, articlesId, productsId, suppliersId]),
      [
        foodTree(treeId),
        objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
        objectTable(productsId, 'Products', PRODUCT_TYPE_ID, 'product'),
        objectTable(suppliersId, 'Suppliers', SUPPLIER_TYPE_ID, 'supplier'),
      ],
    )

    try {
      await openWorkspace(page, new RegExp(`^${own.name}`))
      const tree = pane(page, treeId)
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      const suppliers = pane(page, suppliersId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(suppliers.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await waitForRows(articles)
      await waitForRows(products)

      // A tree node and a row in one peer table are live selections. Suppliers
      // has no selected row, so it must still be offered and then show the
      // documented "Select a row in Suppliers" state when chosen.
      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      const firstProduct = products.getByTestId('object-row').first()
      await firstProduct.click()
      await expect(firstProduct).toHaveAttribute('aria-selected', 'true')

      // Exact menu: All Articles, the two linked-type peers, the food tree, and
      // the self source (disabled because it would close a cycle).
      let palette = await openSourceMenu(page, articles)
      expect((await menuTitles(palette)).sort()).toEqual([
        'All Articles',
        'Articles from Articles',
        'Articles from Food',
        'Articles from Products',
        'Articles from Suppliers',
      ].sort())
      const self = palette.locator('.hit').filter({ hasText: 'Articles from Articles' }).first()
      await expect(self).toHaveAttribute('aria-disabled', 'true')
      await expect(self).toContainText('Would create a cycle (Articles follows Articles)')
      await expect(palette.locator('.hit').filter({ hasText: 'All Products' })).toHaveCount(0)
      await expect(palette.locator('.hit').filter({ hasText: 'All Suppliers' })).toHaveCount(0)
      await expect(palette.locator('.hit').filter({ hasText: 'Products from Articles' })).toHaveCount(0)
      await expect(palette.locator('.hit').filter({ hasText: 'Suppliers from Articles' })).toHaveCount(0)
      await shot(page, info, '20-articles-derivable-menu.png')
      await page.keyboard.press('Escape')

      // Each enabled source fills the table or shows the documented empty state.
      for (const title of ['All Articles', 'Articles from Products', 'Articles from Suppliers', 'Articles from Food']) {
        await chooseTitle(page, articles, title)
        await expect(articles.getByTestId('view-source-label')).not.toHaveText('')
        await expectRowsOrEmpty(articles)
        if (title !== 'All Articles') {
          await expect(articles.getByTestId('peer-linked-to')).toBeVisible({ timeout: 20_000 })
        }
      }

      // The tree source itself is stored as a peer with its node selection.
      await waitForSourceState(page, own.workspaceId, articlesId, { kind: 'peer', viewId: treeId, selection: 'node' })

      // Reload keeps a row-driven peer too: the URL restores the product row, so
      // Articles from Products shows the same linked rows after F5.
      await chooseTitle(page, articles, 'Articles from Products')
      await waitForSourceState(page, own.workspaceId, articlesId, {
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
        linkType: 'product_articles',
      })
      await expect(articles.getByTestId('peer-linked-to')).toContainText('Linked to: Products', { timeout: 30_000 })
      const before = await articles.getByTestId('object-row').allInnerTexts()
      await waitForSourceState(page, own.workspaceId, articlesId, {
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
        linkType: 'product_articles',
      })
      await page.reload()
      await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
      const articlesAfter = pane(page, articlesId)
      await expect(articlesAfter.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(articlesAfter.getByTestId('peer-linked-to')).toContainText('Linked to: Products', { timeout: 30_000 })
      await expectRowsOrEmpty(articlesAfter)
      await expect
        .poll(async () => articlesAfter.getByTestId('object-row').allInnerTexts(), { timeout: 30_000 })
        .toEqual(before)
      await shot(page, info, '21-articles-after-reload.png')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })

  test('Products menu lists only Product-yielding sources and reload keeps the chosen peer', async ({ page }, info) => {
    test.setTimeout(240_000)
    await login(page)

    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const suppliersId = crypto.randomUUID()
    const treeId = crypto.randomUUID()
    const own = await createWorkspace(
      page,
      'Derivable products',
      splitLayout([treeId, articlesId, productsId, suppliersId]),
      [
        foodTree(treeId),
        objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
        objectTable(productsId, 'Products', PRODUCT_TYPE_ID, 'product'),
        objectTable(suppliersId, 'Suppliers', SUPPLIER_TYPE_ID, 'supplier'),
      ],
    )

    try {
      await openWorkspace(page, new RegExp(`^${own.name}`))
      const tree = pane(page, treeId)
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      const suppliers = pane(page, suppliersId)
      await expect(tree.getByTestId('structure-tree')).toBeVisible({ timeout: 60_000 })
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(suppliers.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await waitForRows(articles)
      await waitForRows(products)

      await tree.getByRole('treeitem').filter({ hasText: 'Cheese' }).first().click()
      await articles.getByTestId('object-row').first().click()

      const palette = await openSourceMenu(page, products)
      expect((await menuTitles(palette)).sort()).toEqual([
        'All Products',
        'Products from Articles',
        'Products from Food',
        'Products from Suppliers',
      ].sort())
      for (const wrong of ['All Articles', 'All Suppliers', 'Articles from Products', 'Suppliers from Products']) {
        await expect(palette.locator('.hit').filter({ hasText: wrong })).toHaveCount(0)
      }
      await shot(page, info, '22-products-derivable-menu.png')
      await palette.locator('.hit').filter({ hasText: 'Products from Articles' }).first().click()
      await expect(palette).toHaveCount(0)

      await expect(products.getByTestId('peer-linked-to')).toHaveText('Linked to: Articles', { timeout: 30_000 })
      await expectRowsOrEmpty(products)
      await waitForSourceState(page, own.workspaceId, productsId, {
        kind: 'peer',
        viewId: articlesId,
        selection: 'row',
        linkType: 'product_articles',
      })
      const before = await products.getByTestId('object-row').allInnerTexts()

      await page.reload()
      await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
      const productsAfter = pane(page, productsId)
      await expect(productsAfter.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(productsAfter.getByTestId('peer-linked-to')).toHaveText('Linked to: Articles', { timeout: 30_000 })
      await expectRowsOrEmpty(productsAfter)
      await expect
        .poll(async () => productsAfter.getByTestId('object-row').allInnerTexts(), { timeout: 30_000 })
        .toEqual(before)
      await shot(page, info, '23-products-after-reload.png')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })

  test('a follow-chain source stays listed but disabled with the row 280 wording', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const own = await createWorkspace(
      page,
      'Derivable cycle',
      splitLayout([articlesId, productsId]),
      [
        objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
        objectTable(productsId, 'Products', PRODUCT_TYPE_ID, 'product'),
      ],
    )

    try {
      // Articles already follows Products, so Products following Articles would
      // close the chain.
      const response = await page.request.post('/v1/views', {
        data: {
          ...objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
          workspace_id: own.workspaceId,
          state: {
            columns,
            sort: 'number',
            object_type: ARTICLE_TYPE_ID,
            type_key: 'article',
            source: { kind: 'peer', viewId: productsId, selection: 'row' },
          },
        },
      })
      expect(response.ok()).toBeTruthy()

      await openWorkspace(page, new RegExp(`^${own.name}`))
      const products = pane(page, productsId)
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })

      const palette = await openSourceMenu(page, products)
      const cycle = palette.locator('.hit').filter({ hasText: 'Products from Articles' }).first()
      await expect(cycle).toBeVisible()
      await expect(cycle).toHaveAttribute('aria-disabled', 'true')
      await expect(cycle).toContainText('Would create a cycle (Products follows Articles)')
      await expect(cycle).not.toContainText('PROD-')
      await cycle.dispatchEvent('click')
      await expect(palette).toBeVisible()
      await page.keyboard.press('Escape')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })
})
