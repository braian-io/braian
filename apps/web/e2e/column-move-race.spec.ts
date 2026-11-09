import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { demoCredentials } from './demo'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'
const ARTICLE_TYPE_ID = '018f0000-0000-7000-8000-000000000201'
// One failure in any repetition fails the whole test.
const REPS = 20
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

/**
 * Products and Articles side by side with a Detail pane. Clicking a body cell
 * opens an object in Detail asynchronously, which is the race this spec pins:
 * the later header click in the other table must still win the chord.
 */
async function createWorkspace(page: Page): Promise<Fixture> {
  const workspaceId = crypto.randomUUID()
  const productsId = crypto.randomUUID()
  const articlesId = crypto.randomUUID()
  const detailId = crypto.randomUUID()
  const name = `Column race ${workspaceId.slice(0, 8)}`
  const layout = {
    type: 'split',
    dir: 'horizontal',
    ratios: [0.34, 0.33, 0.33],
    children: [
      { type: 'tabs', views: [productsId], active: 0 },
      { type: 'tabs', views: [articlesId], active: 0 },
      { type: 'tabs', views: [detailId], active: 0 },
    ],
  }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name,
      locked: false,
      share_token: `column-race-${workspaceId.slice(0, 8)}`,
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
      pane: 'center',
      position: 1,
      state: { columns: ['number', 'name', 'status'], sort: 'number', object_type: ARTICLE_TYPE_ID, type_key: 'article' },
    },
    { id: detailId, type: 'object_detail', title: 'Detail', pane: 'right', position: 2, state: { language: 'en' } },
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

async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
}

/**
 * One race: reload, then with no waits click a body cell in `body`, click the
 * Name header in `header`, and press the chord. The header click is the last
 * activation, so the move must target `header`'s view and leave `body` alone.
 *
 * The events are dispatched straight at the nodes instead of using coordinate
 * clicks: Playwright's actionability checks (and even a force click's box
 * measurement) can wait for the Detail pane's async reflow, which hides the
 * race, or land on a neighbour after the reflow. Dispatching keeps the three
 * user actions back to back while still going through the real React handlers.
 */
async function race(
  page: Page,
  tables: { body: Locator; header: Locator; expectedViewId: string },
  direction: 'left' | 'right',
  label: string,
) {
  const beforeBody = await columnIds(tables.body)
  const beforeHeader = await columnIds(tables.header)
  const from = beforeHeader.indexOf('name')
  expect(from, `${label}: header starts with Name`).toBeGreaterThanOrEqual(0)
  const to = from + (direction === 'left' ? -1 : 1)
  expect(to, `${label}: move stays in bounds`).toBeGreaterThanOrEqual(0)
  expect(to, `${label}: move stays in bounds`).toBeLessThan(beforeHeader.length)

  const saved = nextColumnPrefsPut(page)
  const bodyCell = tables.body.getByTestId('object-row').first().locator('[data-column="type"]')
  const headerName = tables.header.getByTestId('col-name')
  // Body click opens Detail asynchronously. Then the header pointerdown and
  // click, then the chord, with no wait or poll in between.
  await bodyCell.dispatchEvent('pointerdown')
  await bodyCell.dispatchEvent('mousedown')
  await bodyCell.dispatchEvent('click')
  await headerName.dispatchEvent('pointerdown')
  await headerName.dispatchEvent('click')
  await page.keyboard.press(direction === 'left' ? 'Control+Shift+ArrowLeft' : 'Control+Shift+ArrowRight')

  expect(await saved, `${label}: chord must target the header table`).toBe(tables.expectedViewId)
  await expect
    .poll(async () => (await columnIds(tables.header)).indexOf('name'), { message: `${label}: header moves ${direction}` })
    .toBe(to)
  expect(await columnIds(tables.body), `${label}: body table is untouched`).toEqual(beforeBody)
}

test('header click after a body click wins the chord (row 107 race)', async ({ page }) => {
  test.setTimeout(900_000)
  await login(page)
  const fixture = await createWorkspace(page)
  await openWorkspace(page, fixture.name)

  const productsPane = page.locator(`[data-pane="${fixture.productsId}"]`)
  const articlesPane = page.locator(`[data-pane="${fixture.articlesId}"]`)
  const products = productsPane.getByTestId('object-table').first()
  const articles = articlesPane.getByTestId('object-table').first()
  await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await shot(page, 'race-00-before')

  for (let rep = 0; rep < REPS; rep += 1) {
    // Alternate the chord so each table's Name oscillates between index 1 and
    // 2 and the move never lands on a boundary (a no-op would prove nothing).
    const direction = rep % 2 === 0 ? 'right' : 'left'
    await openWorkspace(page, fixture.name)
    await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await race(page, { body: products, header: articles, expectedViewId: fixture.articlesId }, direction, `rep ${rep} products-cell/articles-header ${direction}`)
    await shot(page, `race-${String(rep * 2 + 1).padStart(2, '0')}-articles-header`)

    await openWorkspace(page, fixture.name)
    await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(articles.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await race(page, { body: articles, header: products, expectedViewId: fixture.productsId }, direction, `rep ${rep} articles-cell/products-header ${direction}`)
    await shot(page, `race-${String(rep * 2 + 2).padStart(2, '0')}-products-header`)
  }
})
