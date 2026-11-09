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

async function createWorkspace(page: Page, options: { peerArticles?: boolean } = {}): Promise<Fixture> {
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
      state: {
        columns: ['number', 'name', 'status'],
        sort: 'number',
        object_type: ARTICLE_TYPE_ID,
        type_key: 'article',
        ...(options.peerArticles
          ? { source: { kind: 'peer', viewId: productsId, selection: 'row' } }
          : {}),
      },
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

/** Run one move and prove the other table keeps its exact column order. */
async function moveOnly(options: {
  page: Page
  target: Locator
  other: Locator
  viewId: string
  direction: 'left' | 'right'
  label: string
  trigger: () => Promise<unknown>
}) {
  const { page, target, other, viewId, direction, label, trigger } = options
  const beforeTarget = await columnIds(target)
  const beforeOther = await columnIds(other)
  const from = beforeTarget.indexOf('name')
  expect(from, `${label}: target starts with Name`).toBeGreaterThanOrEqual(0)
  const to = from + (direction === 'left' ? -1 : 1)
  expect(to, `${label}: move stays in bounds`).toBeGreaterThanOrEqual(0)
  expect(to, `${label}: move stays in bounds`).toBeLessThan(beforeTarget.length)

  const saved = columnPrefs(page, viewId)
  await trigger()
  await saved
  await expect
    .poll(async () => (await columnIds(target)).indexOf('name'), { message: `${label}: target moves ${direction}` })
    .toBe(to)
  expect(await columnIds(other), `${label}: other table is untouched`).toEqual(beforeOther)
}

async function moveFromPalette(page: Page, direction: 'left' | 'right') {
  const label = direction === 'left' ? 'Move column left' : 'Move column right'
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(label)
  const option = page
    .getByTestId('command-palette')
    .getByRole('option')
    .filter({ hasText: label })
    .first()
  await expect(option).toContainText('Name')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('command-palette')).toBeHidden()
}

async function moveFromHeaderMenu(page: Page, table: Locator, direction: 'left' | 'right') {
  await table.getByTestId('col-name').click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: new RegExp(`Move column ${direction}`) }).click()
}

async function moveOnBus(page: Page, viewId: string, direction: 'left' | 'right') {
  await page.evaluate(async ({ targetViewId, moveDirection }) => {
    const busPath = '/src/ui-bus.ts'
    const bus = await import(/* @vite-ignore */ busPath)
    bus.dispatchUi('ui.move_column', { column: 'name', direction: moveDirection, viewId: targetViewId })
  }, { targetViewId: viewId, moveDirection: direction })
}

/** The view id saved by the next column move, before it happens. */
function nextColumnPrefsPut(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/column-prefs') && response.request().method() === 'PUT',
    { timeout: 15_000 },
  ).then((response) => {
    const match = response.url().match(/\/v1\/views\/([^/]+)\/column-prefs/)
    return match?.[1] ?? ''
  })
}

test('every move path targets the clicked header table, never its neighbor', async ({ page }) => {
  test.setTimeout(300_000)
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
  expect(beforeProducts.indexOf('name')).toBe(1)
  expect(beforeArticles.indexOf('name')).toBe(1)
  await shot(page, '01-before')

  const keyboard = (direction: 'left' | 'right') => () =>
    page.keyboard.press(direction === 'left' ? 'Control+Shift+ArrowLeft' : 'Control+Shift+ArrowRight')

  // 1) Keyboard after a header click, both tables and both directions.
  await products.getByTestId('col-name').click()
  await expect(products.getByTestId('col-name')).toHaveAttribute('data-active-column', 'true')
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'right', label: 'keyboard products right', trigger: keyboard('right') })
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'left', label: 'keyboard products left', trigger: keyboard('left') })
  await articles.getByTestId('col-name').click()
  await expect(articles.getByTestId('col-name')).toHaveAttribute('data-active-column', 'true')
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'right', label: 'keyboard articles right', trigger: keyboard('right') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'left', label: 'keyboard articles left', trigger: keyboard('left') })
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '02-after-keyboard-both')

  // 2) Ctrl+K after a header click, both tables. Repeat clicks keep the same
  // active column, which used to leave the move target on the other pane.
  await products.getByTestId('col-name').click()
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'right', label: 'palette products right', trigger: () => moveFromPalette(page, 'right') })
  await products.getByTestId('col-name').click()
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'left', label: 'palette products left', trigger: () => moveFromPalette(page, 'left') })
  await articles.getByTestId('col-name').click()
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'right', label: 'palette articles right', trigger: () => moveFromPalette(page, 'right') })
  await articles.getByTestId('col-name').click()
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'left', label: 'palette articles left', trigger: () => moveFromPalette(page, 'left') })
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '03-after-palette-both')

  // 3) Cell focus keyboard, both tables and both directions.
  const cellKeyboard = (table: Locator, direction: 'left' | 'right') => async () => {
    await table.getByTestId('object-row').first().locator('[data-column="name"]').click()
    await keyboard(direction)()
  }
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'right', label: 'cell products right', trigger: cellKeyboard(products, 'right') })
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'left', label: 'cell products left', trigger: cellKeyboard(products, 'left') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'right', label: 'cell articles right', trigger: cellKeyboard(articles, 'right') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'left', label: 'cell articles left', trigger: cellKeyboard(articles, 'left') })
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)

  // 4) Header menu, both tables and both directions.
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'right', label: 'menu products right', trigger: () => moveFromHeaderMenu(page, products, 'right') })
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'left', label: 'menu products left', trigger: () => moveFromHeaderMenu(page, products, 'left') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'right', label: 'menu articles right', trigger: () => moveFromHeaderMenu(page, articles, 'right') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'left', label: 'menu articles left', trigger: () => moveFromHeaderMenu(page, articles, 'left') })
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '04-after-header-menu-both')

  // 5) Explicit ui.move_column on the bus, both tables and both directions.
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'right', label: 'bus products right', trigger: () => moveOnBus(page, fixture.productsId, 'right') })
  await moveOnly({ page, target: products, other: articles, viewId: fixture.productsId, direction: 'left', label: 'bus products left', trigger: () => moveOnBus(page, fixture.productsId, 'left') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'right', label: 'bus articles right', trigger: () => moveOnBus(page, fixture.articlesId, 'right') })
  await moveOnly({ page, target: articles, other: products, viewId: fixture.articlesId, direction: 'left', label: 'bus articles left', trigger: () => moveOnBus(page, fixture.articlesId, 'left') })
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '05-after-bus-both')

  // Legal boundaries cannot leak to the other table. Articles still has Name
  // active, so a wrong target would move it instead of doing nothing.
  const firstColumn = beforeProducts[0]!
  const lastColumn = beforeProducts[beforeProducts.length - 1]!
  await products.getByTestId(`col-${firstColumn}`).click()
  await page.keyboard.press('Control+Shift+ArrowLeft')
  await page.waitForTimeout(400)
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)

  await products.getByTestId(`col-${lastColumn}`).click()
  await page.keyboard.press('Control+Shift+ArrowRight')
  await page.waitForTimeout(400)
  expect(await columnIds(products)).toEqual(beforeProducts)
  expect(await columnIds(articles)).toEqual(beforeArticles)

  // Reload keeps both saved column orders.
  await openWorkspace(page, fixture.name)
  await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => columnIds(products)).toEqual(beforeProducts)
  await expect.poll(() => columnIds(articles)).toEqual(beforeArticles)
  await shot(page, '06-after-reload')
})

// Row 107 retest A1/C1b: the keyboard chord must use the same target as Ctrl+K —
// the last clicked header/cell, not the focused pane.
test('keyboard chord follows the last clicked header across peer panes (A1, C1b)', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  const fixture = await createWorkspace(page, { peerArticles: true })
  await openWorkspace(page, fixture.name)

  const productsPane = page.locator(`[data-pane="${fixture.productsId}"]`)
  const articlesPane = page.locator(`[data-pane="${fixture.articlesId}"]`)
  const products = productsPane.getByTestId('object-table').first()
  const articles = articlesPane.getByTestId('object-table').first()
  await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

  const beforeProducts = await columnIds(products)
  const beforeArticles = await columnIds(articles)
  expect(beforeProducts).toContain('type')
  expect(beforeArticles).toContain('type')
  expect(beforeProducts.indexOf('name')).toBe(1)
  expect(beforeArticles.indexOf('name')).toBe(1)
  await shot(page, 'a1-01-before')

  // A1: click a Products cell (Type), then the Articles header Name, then chord right.
  // Only Articles Name may move; Products keeps its exact order.
  await products.getByTestId('object-row').first().locator('[data-column="type"]').click()
  await articles.getByTestId('col-name').click()
  await expect(articles.getByTestId('col-name')).toHaveAttribute('data-active-column', 'true')

  const a1saved = nextColumnPrefsPut(page)
  await page.keyboard.press('Control+Shift+ArrowRight')
  expect(await a1saved, 'A1: chord must target the Articles view').toBe(fixture.articlesId)
  await expect
    .poll(async () => (await columnIds(articles)).indexOf('name'), { message: 'A1: Articles Name moves right' })
    .toBe(beforeArticles.indexOf('name') + 1)
  expect(await columnIds(products), 'A1: Products is untouched').toEqual(beforeProducts)
  await shot(page, 'a1-02-after')

  const afterA1Articles = await columnIds(articles)

  // C1b: Articles cell, Products header Name, chord right (Products Name moves),
  // then Products header Name again, chord left (Products Name moves back).
  await articles.getByTestId('object-row').first().locator('[data-column="type"]').click()
  await products.getByTestId('col-name').click()
  await expect(products.getByTestId('col-name')).toHaveAttribute('data-active-column', 'true')

  const c1saved = nextColumnPrefsPut(page)
  await page.keyboard.press('Control+Shift+ArrowRight')
  expect(await c1saved, 'C1: chord must target the Products view').toBe(fixture.productsId)
  await expect
    .poll(async () => (await columnIds(products)).indexOf('name'), { message: 'C1: Products Name moves right' })
    .toBe(beforeProducts.indexOf('name') + 1)
  expect(await columnIds(articles), 'C1: Articles is untouched').toEqual(afterA1Articles)

  await products.getByTestId('col-name').click()
  await expect(products.getByTestId('col-name')).toHaveAttribute('data-active-column', 'true')

  const c1bSaved = nextColumnPrefsPut(page)
  await page.keyboard.press('Control+Shift+ArrowLeft')
  expect(await c1bSaved, 'C1b: chord must target the Products view').toBe(fixture.productsId)
  await expect
    .poll(async () => (await columnIds(products)).indexOf('name'), { message: 'C1b: Products Name moves left' })
    .toBe(beforeProducts.indexOf('name'))
  expect(await columnIds(articles), 'C1b: Articles is untouched').toEqual(afterA1Articles)
  // Soft check: the sort arrow stays on the column that was clicked, not a neighbour.
  await expect(products.getByTestId('col-name')).not.toHaveAttribute('aria-sort', 'none')
  await shot(page, 'c1b-03-after')
})

