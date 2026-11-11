import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const shots = process.env.BRAIAN_ROW128B_SHOTS
  ? resolve(process.env.BRAIAN_ROW128B_SHOTS)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row128b-object-node-links')

const ARTICLE_ENTRIES = ['Link Product…', 'Link Supplier…', 'Link Replaced by…', 'Link Replaces…']
const PRODUCT_ENTRIES = ['Link Articles…', 'Link Suppliers…']

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openObjectGraph(page: Page, title: 'Articles' | 'Products', key: string) {
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${title}`) }).click()
  const pane = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: title }),
  })
  await pane.getByTestId('quick-filter').fill(key)
  const row = pane.getByTestId('object-row').filter({ hasText: key }).first()
  await expect(row).toBeVisible()
  const objectId = (await row.getAttribute('id'))?.replace(/^object-row-/, '') ?? ''
  expect(objectId, `${key} object id`).not.toBe('')
  await row.click()
  await page.locator('.pane-tab', { hasText: 'Graph' }).first().click()
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  return objectId
}

async function nodeMarker(page: Page, id: string) {
  const node = page.getByTestId('graph-nodes').locator(`[data-node-id="${id}"]`)
  await expect(node).toHaveCount(1)
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-x', /^-?\d+$/, { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-y', /^-?\d+$/, { timeout: 30_000 })
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

async function openNodeMenu(page: Page, id: string) {
  const { x, y } = await nodeMarker(page, id)
  await page.mouse.click(x, y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  return { menu, x, y }
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

test('article node menu entries open the link picker for the right relation and direction', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)
  const objectId = await openObjectGraph(page, 'Articles', 'ART-CHED-200')
  const nodeId = `object:${objectId}`

  const { menu, x, y } = await openNodeMenu(page, nodeId)
  expect(await menuEntries(menu)).toEqual(ARTICLE_ENTRIES)
  await expectNearNode(menu, x, y)
  await shot(page, 'article-node-menu')

  await menu.getByRole('menuitem', { name: 'Link Supplier…', exact: true }).click()
  const picker = page.getByTestId('link-picker')
  await expect(picker).toBeVisible()
  await expect(page.getByTestId('link-picker-relation')).toHaveText('Supplier · To this object')
  await shot(page, 'article-supplier-picker')

  await picker.getByTestId('link-search').fill('SUP-')
  const peer = picker.getByRole('option').first()
  await expect(peer).toBeVisible()
  await peer.click()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('link-type-single')).toHaveAttribute('data-choice', 'supplier_articles:in')
  await expect(page.getByTestId('link-type-single')).toHaveText('Supplier')
  await shot(page, 'article-supplier-create-direction')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)

  const product = await openNodeMenu(page, nodeId)
  expect(await menuEntries(product.menu)).toEqual(ARTICLE_ENTRIES)
  await product.menu.getByRole('menuitem', { name: 'Link Product…', exact: true }).click()
  await expect(page.getByTestId('link-picker-relation')).toHaveText('Product · To this object')
  await shot(page, 'article-product-picker')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-picker')).toHaveCount(0)

  const replaced = await openNodeMenu(page, nodeId)
  await replaced.menu.getByRole('menuitem', { name: 'Link Replaced by…', exact: true }).click()
  await expect(page.getByTestId('link-picker-relation')).toHaveText('Replaced by · From this object')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-picker')).toHaveCount(0)
})

test('product node menu entries open the link picker for the right relation and direction', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)
  const objectId = await openObjectGraph(page, 'Products', 'PROD-CHEDDAR')
  const nodeId = `object:${objectId}`

  const { menu, x, y } = await openNodeMenu(page, nodeId)
  expect(await menuEntries(menu)).toEqual(PRODUCT_ENTRIES)
  await expectNearNode(menu, x, y)
  await shot(page, 'product-node-menu')

  await menu.getByRole('menuitem', { name: 'Link Articles…', exact: true }).click()
  await expect(page.getByTestId('link-picker')).toBeVisible()
  await expect(page.getByTestId('link-picker-relation')).toHaveText('Articles · From this object')
  await shot(page, 'product-articles-picker')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-picker')).toHaveCount(0)

  const suppliers = await openNodeMenu(page, nodeId)
  await suppliers.menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await expect(page.getByTestId('link-picker-relation')).toHaveText('Suppliers · From this object')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-picker')).toHaveCount(0)
})

test('right-click works while hovering and after clicks, and the keyboard opens the same menu', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const objectId = await openObjectGraph(page, 'Articles', 'ART-CHED-200')
  const nodeId = `object:${objectId}`
  const canvas = page.locator('canvas[data-testid=graph]')

  let marker = await nodeMarker(page, nodeId)
  await page.mouse.move(marker.x, marker.y)
  await expect(canvas).toHaveAttribute('data-settled', 'true')
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  let menu = page.getByTestId('context-menu')
  expect(await menuEntries(menu)).toEqual(ARTICLE_ENTRIES)
  await expectNearNode(menu, marker.x, marker.y)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await page.mouse.click(marker.x, marker.y)
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  for (let attempt = 0; attempt < 4; attempt += 1) {
    marker = await nodeMarker(page, nodeId)
    await page.mouse.move(marker.x, marker.y)
    await page.mouse.click(marker.x, marker.y, { button: 'right' })
    menu = page.getByTestId('context-menu')
    expect(await menuEntries(menu), `right-click ${attempt + 1} after click`).toEqual(ARTICLE_ENTRIES)
    await expectNearNode(menu, marker.x, marker.y)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }
  await shot(page, 'article-after-click-right-clicks')

  const node = (await nodeMarker(page, nodeId)).node
  for (const shortcut of ['Control+Enter', 'Shift+F10', 'ContextMenu']) {
    await node.focus()
    await page.keyboard.press(shortcut)
    menu = page.getByTestId('context-menu')
    expect(await menuEntries(menu), `${shortcut} opens the object menu`).toEqual(ARTICLE_ENTRIES)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }

  const productNode = page.getByTestId('graph-nodes').locator('[data-subtitle="Product"]').first()
  await expect(productNode).toHaveCount(1)
  const productMarker = {
    x: Number(await productNode.getAttribute('data-x')),
    y: Number(await productNode.getAttribute('data-y')),
  }
  await page.mouse.move(marker.x, marker.y)
  await page.mouse.click(productMarker.x, productMarker.y, { button: 'right' })
  expect(await menuEntries(page.getByTestId('context-menu'))).toEqual(PRODUCT_ENTRIES)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
})
