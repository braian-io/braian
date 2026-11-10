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

test.describe('Select source reload and target filtering (row 103 follow-up)', () => {
  test('reload restores the product row and the Products menu lists only Product sources', async ({ page }) => {
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
    const own = await createWorkspace(page, 'Reload link', layout, [
      objectTable(articlesId, 'Articles', ARTICLE_TYPE_ID, 'article'),
      objectTable(productsId, 'Products', PRODUCT_TYPE_ID, 'product'),
      objectTable(suppliersId, 'Suppliers', SUPPLIER_TYPE_ID, 'supplier'),
    ])

    try {
      await openWorkspace(page, new RegExp(`^${own.name}`))
      const articles = pane(page, articlesId)
      const products = pane(page, productsId)
      const suppliers = pane(page, suppliersId)
      await expect(products.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(suppliers.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })

      // Articles follows Products, then a product row is selected.
      const firstProduct = products.getByTestId('object-row').first()
      await firstProduct.click()
      await expect(firstProduct).toHaveAttribute('aria-selected', 'true')
      const palette = await openSourceMenu(page, articles)
      await palette.locator('.hit').filter({ hasText: 'Articles from Products' }).first().click()
      await expect(palette).toHaveCount(0)
      await expect(articles.getByTestId('view-source-label')).toContainText('Products ›', { timeout: 30_000 })
      const linked = articles.getByTestId('object-row')
      await expect(linked.first()).toBeVisible({ timeout: 30_000 })
      const linkedKey = await linked.first().innerText()
      await shot(page, '10-reload-before.png')

      // F5: the URL keeps the object, and Articles must show the same linked rows.
      await page.reload()
      await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
      await expect(page.url()).toContain('object=')
      const articlesAfter = pane(page, articlesId)
      const productsAfter = pane(page, productsId)
      await expect(productsAfter.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(articlesAfter.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
      await expect(articlesAfter.getByTestId('peer-empty-text')).toHaveCount(0)
      await expect(articlesAfter.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })
      await expect
        .poll(async () => articlesAfter.getByTestId('object-row').first().innerText(), { timeout: 30_000 })
        .toBe(linkedKey)
      await expect(productsAfter.getByTestId('object-row').first()).toHaveAttribute('aria-selected', 'true')
      await shot(page, '11-reload-after-linked.png')

      // Give Articles and Suppliers a selected row so their peer options are listed.
      await articlesAfter.getByTestId('object-row').first().click()
      const suppliersAfter = pane(page, suppliersId)
      await suppliersAfter.getByTestId('object-row').first().click()

      // The Products menu offers only sources Products itself can use.
      const productsMenu = await openSourceMenu(page, productsAfter)
      await expect(productsMenu.locator('.hit').filter({ hasText: 'All Products' }).first()).toBeVisible()
      await expect(productsMenu.locator('.hit').filter({ hasText: 'Articles from Products' })).toHaveCount(0)
      await expect(productsMenu.locator('.hit').filter({ hasText: 'Suppliers from Products' })).toHaveCount(0)
      await expect(productsMenu.locator('.hit').filter({ hasText: 'Products from Articles' }).first()).toBeVisible()
      await expect(productsMenu.locator('.hit').filter({ hasText: 'Products from Suppliers' }).first()).toBeVisible()
      await shot(page, '12-products-menu-filtered.png')
      await page.keyboard.press('Escape')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })

  test('a cycle row names the follow direction', async ({ page }) => {
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
    // Products follows Articles and Suppliers follows Products, so Articles
    // sourcing from either would close the loop.
    const own = await createWorkspace(page, 'Cycle label', layout, [
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
      await expect(articles.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })

      const palette = await openSourceMenu(page, articles)
      const direct = palette.locator('.hit').filter({ hasText: 'Articles from Products' }).first()
      await expect(direct).toBeVisible()
      await expect(direct).toHaveAttribute('aria-disabled', 'true')
      await expect(direct).toContainText('Would create a cycle (Articles follows Products)')
      const indirect = palette.locator('.hit').filter({ hasText: 'Articles from Suppliers' }).first()
      await expect(indirect).toBeVisible()
      await expect(indirect).toHaveAttribute('aria-disabled', 'true')
      await expect(indirect).toContainText('Would create a cycle (Articles follows Suppliers)')
      await shot(page, '13-cycle-label.png')
      await page.keyboard.press('Escape')
    } finally {
      await page.request.delete(`/v1/workspaces/${own.workspaceId}`)
    }
  })
})
