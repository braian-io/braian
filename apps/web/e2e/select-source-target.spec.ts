import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
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

function objectTable(id: string, title: string, typeId: string, typeKey: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: 'object_table',
    title,
    pane: 'center',
    position: 0,
    state: { columns, sort: 'number', object_type: typeId, type_key: typeKey, ...extra },
  }
}

async function openWorkspace(page: Page, name: RegExp) {
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name }).click()
}

async function openSourceMenu(page: Page, target: Locator) {
  await target.hover()
  await target.getByTestId('view-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

function shotPath(name: string) {
  const dir = process.env.BRAIAN_ROW103_SHOTS
  if (!dir) return null
  mkdirSync(dir, { recursive: true })
  return join(dir, name)
}

async function shot(page: Page, name: string) {
  const path = shotPath(name)
  if (path) await page.screenshot({ path, fullPage: true })
}

type SourceState = { kind?: string; viewId?: string; selection?: string; linkType?: string }

async function viewStates(page: Page, workspaceId: string) {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as {
    views: Array<{ id: string; state?: { source?: SourceState } }>
  }
  return new Map<string, SourceState | undefined>(body.views.map((view) => [view.id, view.state?.source]))
}

test.describe('Select source keeps the menu target (row 103)', () => {
  test('relation and explicit All hit the menu view in both focus orders and survive reload', async ({ page }) => {
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
    const own = await createWorkspace(page, 'Select target', layout, [
      objectTable(productsId, 'Products', PRODUCT_TYPE_ID, 'product'),
      objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
    ])

    try {
      await openWorkspace(page, new RegExp(`^${own.name}`))
      const products = pane(page, productsId)
      const articles = pane(page, articlesId)
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(products.getByTestId('view-source-label')).toHaveText('All Products')
      await expect(articles.getByTestId('view-source-label')).toHaveText('All Articles')

      const productsBefore = await products.getByTestId('object-row').count()
      expect(productsBefore).toBeGreaterThan(0)

      // Focus stays on Products. The Articles panel menu must still operate on
      // Articles: All Articles is current and Articles from Products is a valid
      // relation, not a self-cycle.
      const firstProduct = products.getByTestId('object-row').first()
      await firstProduct.click()
      await expect(firstProduct).toHaveAttribute('aria-selected', 'true')

      let palette = await openSourceMenu(page, articles)
      const currentArticle = palette.locator('.hit').filter({ hasText: 'All Articles' }).first()
      await expect(currentArticle.locator('.meta-chip').filter({ hasText: 'Current' })).toBeVisible()
      const wrongCurrent = palette.locator('.hit').filter({ hasText: 'All Products' }).first()
      await expect(wrongCurrent.locator('.meta-chip').filter({ hasText: 'Current' })).toHaveCount(0)
      const relation = palette.locator('.hit').filter({ hasText: 'Articles from Products' }).first()
      await expect(relation).toBeVisible()
      await expect(relation).not.toHaveAttribute('aria-disabled', 'true')
      await expect(relation).not.toContainText('Would create a cycle')
      await shot(page, '01-articles-menu-current-and-relation.png')
      await relation.click()
      await expect(palette).toHaveCount(0)

      await expect(articles.getByTestId('view-source-label')).toContainText('All Articles · Products ›', {
        timeout: 30_000,
      })
      await expect(articles.getByTestId('peer-linked-to')).toHaveText('Linked to: Products')
      await expect(products.getByTestId('view-source-label')).toHaveText('All Products')
      await expect(products.getByTestId('peer-linked-to')).toHaveCount(0)
      expect(await products.getByTestId('object-row').count()).toBe(productsBefore)
      await shot(page, '02-products-relation-applied.png')

      let states = await viewStates(page, own.workspaceId)
      expect(states.get(articlesId)).toEqual({
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
        linkType: 'product_articles',
      })
      expect(states.get(productsId)).toBeUndefined()

      // Reload: only the intended view changed, and it persisted. The URL object
      // restores the product row, so the header keeps the row label and Articles
      // shows its linked rows instead of the peer empty state.
      await openWorkspace(page, new RegExp(`^${own.name}`))
      const productsAfter = pane(page, productsId)
      const articlesAfter = pane(page, articlesId)
      await expect(articlesAfter.getByTestId('view-source-label')).toContainText('All Articles · Products', {
        timeout: 60_000,
      })
      await expect(articlesAfter.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })
      await expect(productsAfter.getByTestId('view-source-label')).toHaveText('All Products')
      await expect(productsAfter.getByTestId('peer-linked-to')).toHaveCount(0)
      states = await viewStates(page, own.workspaceId)
      expect(states.get(articlesId)).toEqual({
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
        linkType: 'product_articles',
      })
      expect(states.get(productsId)).toBeUndefined()

      // Pick a row again so Articles has linked rows and can take focus for
      // the second menu order.
      await productsAfter.getByTestId('object-row').first().click()
      await expect(articlesAfter.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })

      // Now Articles holds focus but the Products menu opens. Explicit All
      // Products must change Products only; the Articles relation stays.
      await articlesAfter.locator('.pane-tab-open').click()
      palette = await openSourceMenu(page, productsAfter)
      const currentProduct = palette.locator('.hit').filter({ hasText: 'All Products' }).first()
      await expect(currentProduct.locator('.meta-chip').filter({ hasText: 'Current' })).toBeVisible()
      const articleRelation = palette.locator('.hit').filter({ hasText: 'Articles from Products' }).first()
      await expect(articleRelation.locator('.meta-chip').filter({ hasText: 'Current' })).toHaveCount(0)
      await shot(page, '03-products-menu-current-all.png')
      await currentProduct.click()
      await expect(palette).toHaveCount(0)

      await expect(productsAfter.getByTestId('view-source-label')).toHaveText('All Products')
      await expect(articlesAfter.getByTestId('view-source-label')).toContainText('Products ›', { timeout: 30_000 })
      states = await viewStates(page, own.workspaceId)
      expect(states.get(productsId)).toEqual({ kind: 'all' })
      expect(states.get(articlesId)).toEqual({
        kind: 'peer',
        viewId: productsId,
        selection: 'row',
        linkType: 'product_articles',
      })

      await openWorkspace(page, new RegExp(`^${own.name}`))
      const productsReloaded = pane(page, productsId)
      const articlesReloaded = pane(page, articlesId)
      await expect(productsReloaded.getByTestId('view-source-label')).toHaveText('All Products')
      await expect(articlesReloaded.getByTestId('view-source-label')).toContainText('All Articles · Products', {
        timeout: 60_000,
      })
      await shot(page, '04-after-reload-second-target.png')

      // Ctrl+K follows the focused view, not the last explicit menu target.
      // Products holds focus here; the Articles menu opened just above must not
      // leak its target into the keyboard palette.
      await productsReloaded.getByTestId('object-table').first().click({ position: { x: 24, y: 24 } })
      await openSourceMenu(page, articlesReloaded)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)

      await page.keyboard.press('Control+k')
      await expect(page.getByTestId('command-palette')).toBeVisible()
      await page.getByTestId('palette-input').fill('Data source')
      const dataRoot = page.getByTestId('command-palette')
        .locator('.hit')
        .filter({ hasText: 'Data source' })
        .filter({ hasNotText: 'Ask AI' })
        .first()
      await expect(dataRoot).toBeVisible()
      await dataRoot.click()
      const focusedAll = page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All Products' }).first()
      await expect(focusedAll.locator('.meta-chip').filter({ hasText: 'Current' })).toBeVisible()
      const otherAll = page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All Articles' }).first()
      await expect(otherAll.locator('.meta-chip').filter({ hasText: 'Current' })).toHaveCount(0)
      await shot(page, '05-ctrl-k-follows-focus.png')
      await page.keyboard.press('Escape')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })

  test('a genuine A -> B -> C -> A chain is disabled while the menu target is not the focused pane', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    const articlesId = crypto.randomUUID()
    const productsId = crypto.randomUUID()
    const suppliersId = crypto.randomUUID()
    const layout = {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.34, 0.33, 0.33],
      children: [
        { type: 'tabs', views: [articlesId], active: 0 },
        { type: 'tabs', views: [productsId], active: 0 },
        { type: 'tabs', views: [suppliersId], active: 0 },
      ],
    }
    // B follows A, C follows B. Sourcing A from C closes C -> B -> A.
    const own = await createWorkspace(page, 'Select cycle', layout, [
      objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
      objectTable(productsId, 'Products', PRODUCT_TYPE_ID, 'product', {
        source: { kind: 'peer', viewId: articlesId, selection: 'row' },
      }),
      objectTable(suppliersId, 'Suppliers', SUPPLIER_TYPE_ID, 'supplier', {
        source: { kind: 'peer', viewId: productsId, selection: 'row' },
      }),
    ])

    try {
      await openWorkspace(page, new RegExp(`^${own.name}`))
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      const suppliers = pane(page, suppliersId)
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      // B and C have a peer source but no selected row yet, so they explain the
      // empty state instead of rendering a table.
      await expect(products.getByTestId('peer-empty-text')).toHaveText('Select a row in Articles', {
        timeout: 30_000,
      })
      await expect(suppliers.getByTestId('peer-empty-text')).toHaveText('Select a row in Products', {
        timeout: 30_000,
      })

      // Focus Products through its tab, then open the Articles menu without
      // focusing Articles. The explicit menu target must still be Articles.
      await products.locator('.pane-tab-open').click()
      const palette = await openSourceMenu(page, articles)
      const indirect = palette.locator('.hit').filter({ hasText: 'Articles from Suppliers' }).first()
      await expect(indirect).toBeVisible()
      await expect(indirect).toContainText('Would create a cycle')
      await expect(indirect).toHaveAttribute('aria-disabled', 'true')
      // A direct relation from Products is also a loop because B already follows A.
      const direct = palette.locator('.hit').filter({ hasText: 'Articles from Products' }).first()
      await expect(direct).toHaveAttribute('aria-disabled', 'true')
      await shot(page, '06-genuine-cycle-menu.png')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })
})
