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

async function nodeMarker(page: Page, id: string) {
  const node = graphNodes(page).locator(`[data-node-id="${id}"]`)
  await expect(node).toHaveCount(1)
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-x', /^\d+$/, { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-y', /^\d+$/, { timeout: 30_000 })
  const x = Number(await node.getAttribute('data-x'))
  const y = Number(await node.getAttribute('data-y'))
  expect(Number.isFinite(x), `${id} published x`).toBe(true)
  expect(Number.isFinite(y), `${id} published y`).toBe(true)
  return { node, x, y }
}

async function menuEntries(menu: Locator) {
  await expect(menu).toBeVisible()
  return (await menu.getByRole('menuitem').allInnerTexts()).map((text) => text.trim())
}

async function expectNoGlobals(menu: Locator) {
  const text = (await menu.innerText()) ?? ''
  for (const label of forbiddenGlobals) {
    expect(text.includes(label), `menu must not contain "${label}"`).toBe(false)
  }
}

async function expectNearNode(menu: Locator, x: number, y: number) {
  const box = await menu.boundingBox()
  expect(box, 'menu box').toBeTruthy()
  const distance = Math.hypot(box!.x + box!.width / 2 - x, box!.y + box!.height / 2 - y)
  expect(distance, 'menu opens at the node, not the viewport corner').toBeLessThan(300)
}

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

async function openObjectTypes(page: Page) {
  await expect(page.getByTestId('object-types-table')).toBeVisible({ timeout: 30_000 })
}

async function activeTypeRow(page: Page, key: string) {
  const row = page.getByTestId('object-types-table').locator(`[data-testid="standard-grid-row"][data-key="${key}"]`)
  await expect(row).toHaveCount(1)
  return row
}

test('type nodes show exact type actions and Product, Supplier and Article differ', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)
  await openModelGraph(page)

  const cases = [
    { id: 'type:product', label: 'Open Product', shot: 'product-right-click' },
    { id: 'type:supplier', label: 'Open Supplier', shot: 'supplier-right-click' },
    { id: 'type:article', label: 'Open Article', shot: 'article-right-click' },
  ]
  for (const item of cases) {
    const { x, y } = await nodeMarker(page, item.id)
    await page.mouse.click(x, y, { button: 'right' })
    const menu = page.getByTestId('context-menu')
    expect(await menuEntries(menu)).toEqual([item.label])
    await expectNoGlobals(menu)
    await expectNearNode(menu, x, y)
    await shot(page, item.shot)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }
})

test('keyboard shortcuts open the same menu at the node and the focus ring is visible', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)
  await openModelGraph(page)

  const { node, x, y } = await nodeMarker(page, 'type:product')
  await page.mouse.click(x, y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  const rightClickEntries = await menuEntries(menu)
  await expectNearNode(menu, x, y)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await node.focus()
  const ring = page.getByTestId('graph-focus-ring')
  await expect(ring).toBeVisible()
  const ringBox = await ring.boundingBox()
  expect(ringBox, 'focus ring box').toBeTruthy()
  const ringDistance = Math.hypot(ringBox!.x + ringBox!.width / 2 - x, ringBox!.y + ringBox!.height / 2 - y)
  expect(ringDistance, 'focus ring sits on the visible node').toBeLessThan(6)
  expect(await ring.evaluate((element) => getComputedStyle(element).borderTopWidth)).not.toBe('0px')
  await shot(page, 'product-focus-ring')

  await page.keyboard.press('Shift+F10')
  expect(await menuEntries(menu)).toEqual(rightClickEntries)
  await expectNearNode(menu, x, y)
  await shot(page, 'product-keyboard-shift-f10')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await node.focus()
  await page.keyboard.press('Control+Enter')
  expect(await menuEntries(menu)).toEqual(rightClickEntries)
  await expectNearNode(menu, x, y)
  await shot(page, 'product-keyboard-ctrl-enter')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await node.focus()
  await page.keyboard.press('ContextMenu')
  expect(await menuEntries(menu)).toEqual(rightClickEntries)
  await expectNearNode(menu, x, y)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  const supplier = await nodeMarker(page, 'type:supplier')
  await supplier.node.focus()
  await expect(page.getByTestId('graph-focus-ring')).toBeVisible()
  await shot(page, 'supplier-focus-ring')
  await page.keyboard.press('Shift+F10')
  expect(await menuEntries(menu)).toEqual(['Open Supplier'])
  await expectNearNode(menu, supplier.x, supplier.y)
  await shot(page, 'supplier-keyboard-shift-f10')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})

test('Open Product and Open Supplier select that type in Object types', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)
  await openModelGraph(page)

  const product = await nodeMarker(page, 'type:product')
  await page.mouse.click(product.x, product.y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  expect(await menuEntries(menu)).toEqual(['Open Product'])
  await menu.getByRole('menuitem', { name: 'Open Product' }).click()
  await openObjectTypes(page)
  const productRow = await activeTypeRow(page, 'product')
  await expect(productRow).toHaveClass(/\bon\b/)
  await shot(page, 'product-open-effect')

  await openModelGraph(page)
  const supplier = await nodeMarker(page, 'type:supplier')
  await page.mouse.click(supplier.x, supplier.y, { button: 'right' })
  expect(await menuEntries(menu)).toEqual(['Open Supplier'])
  await menu.getByRole('menuitem', { name: 'Open Supplier' }).click()
  await openObjectTypes(page)
  const supplierRow = await activeTypeRow(page, 'supplier')
  await expect(supplierRow).toHaveClass(/\bon\b/)
  await shot(page, 'supplier-open-effect')
})

test('empty canvas right-click does not open a Braian menu', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openModelGraph(page)

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

  const { x, y } = await nodeMarker(page, `object:${objectId}`)
  await page.mouse.click(x, y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  expect((await menuEntries(menu)).length).toBeGreaterThan(0)
  await expectNoGlobals(menu)
  await shot(page, 'object-node-menu')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})
