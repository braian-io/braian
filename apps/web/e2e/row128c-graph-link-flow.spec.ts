import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

const shots = process.env.BRAIAN_ROW128C_SHOTS
  ? resolve(process.env.BRAIAN_ROW128C_SHOTS)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row128c-graph-link-flow')

const ARTICLE = { title: 'Articles', key: 'ART-CHOC-100', id: '018f1000-0000-7000-8000-000000000025' }
const PRODUCT = { title: 'Products', key: 'PROD-CHOC', id: '018f1000-0000-7000-8000-000000000014' }
const SUPPLIER = { title: 'Suppliers', key: 'SUP-COAST', id: '018f1000-0000-7000-8000-000000000002' }
const NORTHMILL = { id: '018f1000-0000-7000-8000-000000000001', key: 'SUP-NORTH', name: 'Northmill Foods' }

const ARTICLE_MENU = ['Link Product…', 'Link Supplier…', 'Link Replaced by…', 'Link Replaces…']
const PRODUCT_MENU = ['Link Articles…', 'Link Suppliers…']
const SUPPLIER_MENU = ['Link Articles…', 'Link Product…']
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

type Box = { x: number; y: number; width: number; height: number }
type Rect = { left: number; top: number; right: number; bottom: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

/** Put one supplier in the same Recent store Ctrl+K and the picker read. */
async function seedRecent(page: Page) {
  await page.addInitScript((item) => {
    const id = `hit:${item.id}`
    const now = Date.now()
    localStorage.setItem('braian.palette.rows', JSON.stringify({
      [id]: { id, group: 'search', title: item.name, subtitle: item.key, typeKey: 'supplier' },
    }))
    localStorage.setItem('braian.frecency', JSON.stringify({ [id]: { uses: 3, last: now } }))
  }, NORTHMILL)
}

async function openObjectGraph(page: Page, item: { title: string; key: string }) {
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${item.title}`) }).click()
  const pane = paneWithTab(page, item.title)
  await pane.getByTestId('quick-filter').fill(item.key)
  const row = pane.getByTestId('object-row').filter({ hasText: item.key }).first()
  await expect(row).toBeVisible()
  await row.click()
  await page.locator('.pane-tab', { hasText: 'Graph' }).first().click()
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
}

async function openObjectDetail(page: Page, item: { title: string; key: string }) {
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${item.title}`) }).click()
  const pane = paneWithTab(page, item.title)
  await pane.getByTestId('quick-filter').fill(item.key)
  const row = pane.getByTestId('object-row').filter({ hasText: item.key }).first()
  await expect(row).toBeVisible()
  await row.click()
  const detail = page.getByTestId('object-detail')
  if (!(await detail.isVisible().catch(() => false))) {
    const detailTab = page.locator('.pane-tab[data-view-type="object_detail"]:visible').first()
    if ((await detailTab.count()) > 0) await detailTab.click()
  }
  await expect(detail).toBeVisible()
  await expect(detail).toContainText(item.key)
}

async function nodeMarker(page: Page, id: string) {
  const node = page.getByTestId('graph-nodes').locator(`[data-node-id="object:${id}"]`)
  await expect(node).toHaveCount(1)
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-x', /^-?\d+$/, { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-y', /^-?\d+$/, { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-r', /^\d+$/, { timeout: 30_000 })
  return node
}

async function nodeAvoid(page: Page, id: string) {
  const node = await nodeMarker(page, id)
  const x = Number(await node.getAttribute('data-x'))
  const y = Number(await node.getAttribute('data-y'))
  const r = Number(await node.getAttribute('data-r'))
  const caption = (await node.innerText()).trim()
  const width = Math.max(r * 2, caption.length * 7 + 16)
  return {
    left: x - width / 2,
    top: y - r,
    right: x + width / 2,
    bottom: y + r + 22,
    x,
    y,
    r,
  }
}

async function openNodeMenu(page: Page, id: string) {
  const avoid = await nodeAvoid(page, id)
  await page.mouse.click(avoid.x, avoid.y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  return { menu, avoid }
}

async function menuEntries(menu: Locator) {
  return (await menu.getByRole('menuitem').allInnerTexts()).map((text) => text.trim())
}

async function sectionLabels(page: Page) {
  const labels = await page.getByTestId('link-section').locator('h3').allInnerTexts()
  return labels.map((text) => text.replace(/\s*\(\d+\)$/, '').trim())
}

function menuSectionLabels(entries: string[]) {
  return entries.map((text) => text.replace(/^Link /, '').replace(/…$/, ''))
}

async function pickerSnapshot(page: Page) {
  const picker = page.getByTestId('link-picker')
  await expect(picker).toBeVisible()
  return {
    heading: (await picker.locator('.palette-heading').allInnerTexts()).map((text) => text.trim()).join('|'),
    source: await picker.getByTestId('link-picker-source').innerText(),
    relation: await picker.getByTestId('link-picker-relation').innerText(),
    rows: (await picker.getByRole('option').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim()),
    text: await picker.innerText(),
  }
}

async function openSectionPicker(page: Page, section: string) {
  const card = page.getByTestId('link-section').filter({ has: page.locator('h3', { hasText: section }) })
  await card.getByTestId('add-link').click()
  return page.getByTestId('link-picker')
}

function overlaps(a: Box, b: Rect) {
  return a.x < b.right - 1 && a.x + a.width > b.left + 1 && a.y < b.bottom - 1 && a.y + a.height > b.top + 1
}

async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

test('object node menus come from each node type and match the Detail sections', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await openObjectGraph(page, ARTICLE)

  const article = await openNodeMenu(page, ARTICLE.id)
  expect(await menuEntries(article.menu)).toEqual(ARTICLE_MENU)
  await shot(page, 'article-menu')
  await page.keyboard.press('Escape')

  const product = await openNodeMenu(page, PRODUCT.id)
  expect(await menuEntries(product.menu)).toEqual(PRODUCT_MENU)
  await shot(page, 'product-menu')
  await page.keyboard.press('Escape')

  const supplier = await openNodeMenu(page, SUPPLIER.id)
  expect(await menuEntries(supplier.menu)).toEqual(SUPPLIER_MENU)
  await shot(page, 'supplier-menu')
  await page.keyboard.press('Escape')

  expect(ARTICLE_MENU).not.toEqual(PRODUCT_MENU)
  expect(PRODUCT_MENU).not.toEqual(SUPPLIER_MENU)
  expect(ARTICLE_MENU).not.toEqual(SUPPLIER_MENU)
  for (const menu of [ARTICLE_MENU, PRODUCT_MENU, SUPPLIER_MENU]) {
    expect(menu.some((entry) => /supplier of product/i.test(entry))).toBe(false)
  }

  for (const item of [ARTICLE, PRODUCT, SUPPLIER]) {
    await openObjectDetail(page, item)
    const detailSections = await sectionLabels(page)
    const menu = item === ARTICLE ? ARTICLE_MENU : item === PRODUCT ? PRODUCT_MENU : SUPPLIER_MENU
    expect(menuSectionLabels(menu), `${item.key} menu mirrors its Detail sections`).toEqual(detailSections)
  }
})

test('Detail and Graph open the same picker; filtering, exclusion and the write stay shared', async ({ page }) => {
  test.setTimeout(240_000)
  await seedRecent(page)
  await login(page)

  await openObjectDetail(page, PRODUCT)
  await openSectionPicker(page, 'Suppliers')
  await expect(page.getByTestId('link-picker').locator('.palette-heading')).toHaveText('Recent')
  const detailRecent = await pickerSnapshot(page)
  expect(detailRecent.source).toBe('PROD-CHOC · Dark chocolate 70%')
  expect(detailRecent.relation).toBe('Suppliers · From this object')
  expect(detailRecent.rows.some((row) => row.includes('SUP-NORTH'))).toBe(true)
  expect(detailRecent.text).not.toMatch(UUID)
  await page.getByTestId('link-search').fill('SUP-N')
  await expect(page.getByTestId('link-picker').locator('.palette-heading')).toHaveText('Objects')
  await expect(page.getByTestId('link-picker').getByRole('option').filter({ hasText: 'SUP-NORTH' })).toBeVisible()
  const detailTyped = await pickerSnapshot(page)
  expect(detailTyped.text).not.toMatch(UUID)
  await page.getByTestId('link-picker').getByRole('option').filter({ hasText: 'SUP-NORTH' }).click()
  const detailDialog = page.getByTestId('link-create-dialog')
  await expect(detailDialog).toBeVisible()
  const detailEnds = await detailDialog.getByTestId('link-ends').innerText()
  expect(detailEnds).toContain('PROD-CHOC')
  expect(detailEnds).toContain('Dark chocolate 70%')
  expect(detailEnds).toContain('SUP-NORTH')
  expect(detailEnds).toContain('Northmill Foods')
  expect(detailEnds).toContain('— Suppliers —')
  expect(detailEnds).not.toMatch(UUID)
  await detailDialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(detailDialog).toHaveCount(0)

  await openObjectGraph(page, PRODUCT)
  const { menu } = await openNodeMenu(page, PRODUCT.id)
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await expect(page.getByTestId('link-picker').locator('.palette-heading')).toHaveText('Recent')
  const graphRecent = await pickerSnapshot(page)
  expect(graphRecent.source).toBe('PROD-CHOC · Dark chocolate 70%')
  expect(graphRecent.relation).toBe('Suppliers · From this object')
  expect(graphRecent.rows.some((row) => row.includes('SUP-NORTH'))).toBe(true)
  expect(graphRecent.text).not.toMatch(UUID)
  await shot(page, 'graph-picker-recent')
  await page.getByTestId('link-search').fill('SUP-N')
  await expect(page.getByTestId('link-picker').locator('.palette-heading')).toHaveText('Objects')
  await expect(page.getByTestId('link-picker').getByRole('option').filter({ hasText: 'SUP-NORTH' })).toBeVisible()
  const graphTyped = await pickerSnapshot(page)
  expect(graphTyped.text).not.toMatch(UUID)
  expect(graphRecent.heading).toBe(detailRecent.heading)
  expect(graphRecent.rows).toEqual(detailRecent.rows)
  expect(graphTyped.heading).toBe(detailTyped.heading)
  expect(graphTyped.rows).toEqual(detailTyped.rows)

  // Candidate types come only from the relation, never from products or articles.
  await page.getByTestId('link-search').fill('PROD')
  await expect(page.getByTestId('link-picker-empty')).toBeVisible()
  await page.getByTestId('link-search').fill('ART')
  await expect(page.getByTestId('link-picker-empty')).toBeVisible()
  await page.getByTestId('link-search').fill('SUP-')
  await expect(page.getByTestId('link-picker').getByRole('option').first()).toBeVisible()
  const supplierRows = await page.getByTestId('link-picker').getByRole('option').allInnerTexts()
  expect(supplierRows.length).toBeGreaterThan(0)
  for (const row of supplierRows) expect(row).toMatch(/SUP-/)

  await page.getByTestId('link-search').fill('SUP-NORTH')
  await expect(page.getByTestId('link-picker').locator('.palette-heading')).toHaveText('Objects')
  const choice = page.getByTestId('link-picker').getByRole('option').filter({ hasText: 'SUP-NORTH' })
  await expect(choice).toBeVisible()
  await choice.click()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  const ends = await dialog.getByTestId('link-ends').innerText()
  expect(ends).toContain('PROD-CHOC')
  expect(ends).toContain('Dark chocolate 70%')
  expect(ends).toContain('SUP-NORTH')
  expect(ends).toContain('Northmill Foods')
  expect(ends).toContain('— Suppliers —')
  expect(ends).not.toMatch(UUID)
  expect(await dialog.innerText()).not.toMatch(UUID)
  await shot(page, 'graph-create-dialog')

  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await page.getByTestId('link-create-confirm').click()
  const body = (await (await created).json()) as { id?: string }
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('graph-edges')).toContainText('Suppliers')
  for (const label of await page.getByTestId('graph-edges').locator('[data-edge-id]').allInnerTexts()) {
    expect(label.trim(), 'all edge labels use sentence case').toMatch(/^[A-Z]/)
  }
  await shot(page, 'graph-edge-created')

  // The new peer is linked now; it must not be offered again.
  const again = await openNodeMenu(page, PRODUCT.id)
  await again.menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await page.getByTestId('link-search').fill('SUP-NORTH')
  await expect(page.getByTestId('link-picker-empty')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-picker')).toHaveCount(0)

  expect(body.id, 'created link id').toBeTruthy()
  const removed = await page.request.delete(`/v1/links/${body.id}`)
  expect(removed.ok()).toBe(true)
})

test('menu and graph dialog stay clear of a node at the right edge', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await openObjectGraph(page, ARTICLE)

  const avoid = await nodeAvoid(page, PRODUCT.id)
  expect(avoid.x, 'product node sits near the right edge').toBeGreaterThan(1200)
  const { menu } = await openNodeMenu(page, PRODUCT.id)
  const menuBox = await menu.boundingBox()
  expect(menuBox, 'menu box').toBeTruthy()
  expect(overlaps(menuBox! as Box, avoid), 'menu must not cover the node circle or label').toBe(false)
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1440)
  expect(menuBox!.y).toBeGreaterThanOrEqual(0)
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(900)
  await shot(page, 'right-edge-menu')

  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await page.getByTestId('link-search').fill('SUP-N')
  const choice = page.getByTestId('link-picker').getByRole('option').first()
  await expect(choice).toBeVisible()
  await choice.click()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  const dialogBox = await dialog.boundingBox()
  const current = await nodeAvoid(page, PRODUCT.id)
  expect(dialogBox, 'dialog box').toBeTruthy()
  expect(overlaps(dialogBox! as Box, current), 'graph dialog must not cover the clicked node').toBe(false)
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(1440)
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(900)
  await shot(page, 'right-edge-dialog')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
