import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { demoCredentials } from './demo'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'
const ARTICLE_TYPE_ID = '018f0000-0000-7000-8000-000000000201'
const shots = process.env.BRAIAN_COLUMN_TARGET_SHOTS

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
}

type Fixture = {
  name: string
  productsId: string
  articlesId: string
}

async function createWorkspace(page: Page): Promise<Fixture> {
  const workspaceId = crypto.randomUUID()
  const productsId = crypto.randomUUID()
  const articlesId = crypto.randomUUID()
  const name = `Column target ${workspaceId.slice(0, 8)}`
  const layout = {
    type: 'split',
    dir: 'horizontal',
    ratios: [0.5, 0.5],
    children: [
      { type: 'tabs', views: [productsId], active: 0 },
      { type: 'tabs', views: [articlesId], active: 0 },
    ],
  }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name,
      locked: false,
      share_token: `column-target-${workspaceId.slice(0, 8)}`,
      layout,
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

  for (const view of [
    {
      id: productsId,
      type: 'object_table',
      title: 'Products',
      pane: 'left',
      position: 0,
      state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: PRODUCT_TYPE_ID, type_key: 'product' },
    },
    {
      id: articlesId,
      type: 'object_table',
      title: 'Articles',
      pane: 'right',
      position: 0,
      state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: ARTICLE_TYPE_ID, type_key: 'article' },
    },
  ]) {
    const response = await page.request.post('/v1/views', {
      data: { ...view, workspace_id: workspaceId },
    })
    expect(response.ok(), `create view ${view.title} ${response.status()}`).toBeTruthy()
  }
  return { name, productsId, articlesId }
}

async function openWorkspace(page: Page, name: string) {
  await page.reload()
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${name}`) }).click()
}

async function columnIds(table: Locator) {
  return table.locator('.head [data-testid^="col-"]').evaluateAll((nodes) =>
    nodes.map((node) => (node.getAttribute('data-testid') ?? '').slice('col-'.length)),
  )
}

function columnPrefs(page: Page, viewId: string) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(`/v1/views/${viewId}/column-prefs`) &&
      response.request().method() === 'PUT' &&
      response.ok(),
    { timeout: 30_000 },
  )
}

async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
}

test('only the explicitly targeted table moves a shared Name column', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const fixture = await createWorkspace(page)
  await openWorkspace(page, fixture.name)

  const productsPane = page.locator(`[data-pane="${fixture.productsId}"]`)
  const articlesPane = page.locator(`[data-pane="${fixture.articlesId}"]`)
  const products = productsPane.getByTestId('object-table').first()
  const articles = articlesPane.getByTestId('object-table').first()
  await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

  const beforeProducts = await columnIds(products)
  const beforeArticles = await columnIds(articles)
  const nameIndex = beforeProducts.indexOf('name')
  expect(nameIndex).toBeGreaterThanOrEqual(0)
  expect(beforeArticles).toContain('name')
  await shot(page, '01-before')

  // Keyboard: Ctrl+Shift+Right follows the last activated header in Products.
  const productsName = products.getByTestId('col-name')
  await productsName.click()
  await expect(productsName).toHaveAttribute('data-active-column', 'true')
  const keyboardMove = columnPrefs(page, fixture.productsId)
  await page.keyboard.press('Control+Shift+ArrowRight')
  await keyboardMove
  await expect.poll(async () => (await columnIds(products)).indexOf('name')).toBe(nameIndex + 1)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '02-after-keyboard-products')

  // Ctrl+K uses the same registry command and must only move Products.
  await products.getByTestId('col-name').click()
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('Move column left')
  const paletteMove = page.getByTestId('command-palette').getByRole('option').filter({ hasText: 'Move column left' }).first()
  await expect(paletteMove).toContainText('Name')
  const paletteDone = columnPrefs(page, fixture.productsId)
  await page.keyboard.press('Enter')
  await paletteDone
  await expect.poll(async () => (await columnIds(products)).indexOf('name')).toBe(nameIndex)
  expect(await columnIds(articles)).toEqual(beforeArticles)

  // Switch focus to Articles, then run the header menu command targeted at Products.
  await articles.getByTestId('col-name').click()
  await products.getByTestId('col-name').click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  const headerMove = columnPrefs(page, fixture.productsId)
  await menu.getByRole('menuitem', { name: /Move column right/ }).click()
  await headerMove
  await expect.poll(async () => (await columnIds(products)).indexOf('name')).toBe(nameIndex + 1)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '03-after-header-explicit-products')

  // The agent sends ui.move_column with the same explicit viewId on the UI bus.
  const busMove = columnPrefs(page, fixture.productsId)
  await page.evaluate(async ({ viewId }) => {
    const busPath = '/src/ui-bus.ts'
    const bus = await import(/* @vite-ignore */ busPath)
    bus.dispatchUi('ui.move_column', { column: 'name', direction: 'left', viewId })
  }, { viewId: fixture.productsId })
  await busMove
  await expect.poll(async () => (await columnIds(products)).indexOf('name')).toBe(nameIndex)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '04-after-bus-explicit-products')

  // Legal boundaries do nothing and cannot leak to the other table.
  const atBoundary = { products: await columnIds(products), articles: await columnIds(articles) }
  await products.getByTestId(`col-${atBoundary.products[0]}`).click()
  await page.keyboard.press('Control+Shift+ArrowLeft')
  await page.waitForTimeout(400)
  expect(await columnIds(products)).toEqual(atBoundary.products)
  expect(await columnIds(articles)).toEqual(atBoundary.articles)

  const lastColumn = atBoundary.products[atBoundary.products.length - 1]!
  await products.getByTestId(`col-${lastColumn}`).click()
  await page.keyboard.press('Control+Shift+ArrowRight')
  await page.waitForTimeout(400)
  expect(await columnIds(products)).toEqual(atBoundary.products)
  expect(await columnIds(articles)).toEqual(atBoundary.articles)

  // Reload keeps both saved column orders.
  const finalProducts = await columnIds(products)
  const finalArticles = await columnIds(articles)
  await openWorkspace(page, fixture.name)
  await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => columnIds(products)).toEqual(finalProducts)
  await expect.poll(() => columnIds(articles)).toEqual(finalArticles)
  await shot(page, '05-after-reload')
})
