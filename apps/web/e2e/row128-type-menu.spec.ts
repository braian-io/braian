import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row128-type-menu')

const forbiddenGlobals = ['Search', 'Sign out', 'Light mode', 'Send feedback', 'Open agent', 'Switch catalog', 'Export']

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openModelGraph(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const graphTab = page.locator('.pane-tab', { hasText: 'Model graph' }).first()
  await expect(graphTab).toBeVisible({ timeout: 60_000 })
  await graphTab.click()
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
}

function graphNodes(page: Page) {
  return page.getByTestId('graph-nodes')
}

async function expectNodeScopedMenu(menu: Locator) {
  await expect(menu).toBeVisible()
  const items = menu.getByRole('menuitem')
  expect(await items.count(), 'node menu item count').toBeGreaterThan(0)
  const text = (await menu.innerText()) ?? ''
  for (const label of forbiddenGlobals) {
    expect(text.includes(label), `menu must not contain "${label}"`).toBe(false)
  }
}

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

test('model graph type node opens the node-scoped context menu', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openModelGraph(page)

  const product = graphNodes(page).locator('[data-node-id="type:product"]')
  await expect(product).toHaveCount(1)
  await expect(product).toHaveText('Product')
  const x = Number(await product.getAttribute('data-x'))
  const y = Number(await product.getAttribute('data-y'))
  expect(Number.isFinite(x), 'published x').toBe(true)
  expect(Number.isFinite(y), 'published y').toBe(true)

  // Right-click the published hit point while the graph is settled: the shared
  // node menu opens. A selection first would restart the force simulation (and
  // the model focus would move the canvas), leaving the published point stale.
  await page.mouse.click(x, y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expectNodeScopedMenu(menu)
  await shot(page, 'type-node-menu')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // Left-click the node button: the node is selected and the inspector opens.
  await product.dispatchEvent('click')
  const inspector = page.getByTestId('graph-inspector')
  await expect(inspector).toBeVisible()
  await expect(inspector).toContainText('Product')
  await shot(page, 'type-node-selected')

  // Ctrl+Enter on the focused type node opens the same menu.
  await product.focus()
  await page.keyboard.press('Control+Enter')
  await expectNodeScopedMenu(menu)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  // Empty canvas right-click does not open a custom menu.
  const stage = page.getByTestId('graph-stage')
  const box = await stage.boundingBox()
  expect(box, 'graph stage box').toBeTruthy()
  await page.mouse.click(box!.x + 24, box!.y + 24, { button: 'right' })
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
  await shot(page, 'empty-canvas-right-click')
})

test('object graph node menu still opens without globals', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  const tab = page.locator('nav.tabs').getByRole('button', { name: /^Articles/ })
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  const articles = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Articles' }),
  })
  await articles.getByTestId('quick-filter').fill('ART-CHED-200')
  const row = articles.getByTestId('object-row').filter({ hasText: 'ART-CHED-200' }).first()
  await expect(row).toBeVisible()
  const objectId = (await row.getAttribute('id'))?.replace(/^object-row-/, '') ?? ''
  expect(objectId, 'article row id').not.toBe('')
  await row.click()
  await page.locator('.pane-tab', { hasText: 'Graph' }).first().click()
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })

  const objectNode = graphNodes(page).locator(`[data-node-id="object:${objectId}"]`)
  await expect(objectNode).toHaveCount(1)
  const x = Number(await objectNode.getAttribute('data-x'))
  const y = Number(await objectNode.getAttribute('data-y'))
  expect(Number.isFinite(x), 'published x').toBe(true)
  expect(Number.isFinite(y), 'published y').toBe(true)

  await page.mouse.click(x, y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expectNodeScopedMenu(menu)
  await shot(page, 'object-node-menu')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})
