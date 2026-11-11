import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

const shots = process.env.BRAIAN_ROW128D_SHOTS
  ? resolve(process.env.BRAIAN_ROW128D_SHOTS)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row128d-link-flow-polish')

const ARTICLE = { title: 'Articles', key: 'ART-CHOC-100', id: '018f1000-0000-7000-8000-000000000025' }
const PRODUCT = { title: 'Products', key: 'PROD-CHOC', id: '018f1000-0000-7000-8000-000000000014' }
const NORTHMILL = { key: 'SUP-NORTH', name: 'Northmill Foods' }

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
  await expect(node).toHaveAttribute('data-label-left', /^-?\d+$/, { timeout: 30_000 })
  return node
}

async function nodeAvoid(page: Page, id: string) {
  const node = await nodeMarker(page, id)
  const x = Number(await node.getAttribute('data-x'))
  const y = Number(await node.getAttribute('data-y'))
  const r = Number(await node.getAttribute('data-r'))
  const label = await labelRect(node)
  return {
    left: Math.min(x - r, label.left),
    top: Math.min(y - r, label.top),
    right: Math.max(x + r, label.right),
    bottom: Math.max(y + r, label.bottom),
    x,
    y,
    r,
  }
}

async function labelRect(node: Locator): Promise<Rect> {
  return {
    left: Number(await node.getAttribute('data-label-left')),
    top: Number(await node.getAttribute('data-label-top')),
    right: Number(await node.getAttribute('data-label-right')),
    bottom: Number(await node.getAttribute('data-label-bottom')),
  }
}

async function nodeRects(page: Page) {
  const nodes = page.getByTestId('graph-nodes').locator('[data-node-id][data-x]')
  await expect(nodes.first()).toBeVisible()
  return nodes.evaluateAll((elements) =>
    elements.map((element) => {
      const x = Number(element.getAttribute('data-x'))
      const y = Number(element.getAttribute('data-y'))
      const r = Number(element.getAttribute('data-r'))
      const label = {
        left: Number(element.getAttribute('data-label-left')),
        top: Number(element.getAttribute('data-label-top')),
        right: Number(element.getAttribute('data-label-right')),
        bottom: Number(element.getAttribute('data-label-bottom')),
      }
      return {
        id: element.getAttribute('data-node-id') ?? '',
        circle: { left: x - r, top: y - r, right: x + r, bottom: y + r },
        label,
      }
    }),
  )
}

async function openNodeMenu(page: Page, id: string) {
  const avoid = await nodeAvoid(page, id)
  await page.mouse.click(avoid.x, avoid.y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  return { menu, avoid }
}

async function openSectionPicker(page: Page, section: string) {
  const card = page.getByTestId('link-section').filter({ has: page.locator('h3', { hasText: section }) })
  await card.getByTestId('add-link').click()
  return page.getByTestId('link-picker')
}

async function chooseSupplier(page: Page, supplier = NORTHMILL) {
  await page.getByTestId('link-search').fill(supplier.key)
  const option = page.getByTestId('link-picker').getByRole('option').filter({ hasText: supplier.key }).first()
  await expect(option).toBeVisible()
  await option.click()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

function overlaps(a: Box, b: Rect) {
  return a.x < b.right - 1 && a.x + a.width > b.left + 1 && a.y < b.bottom - 1 && a.y + a.height > b.top + 1
}

async function expectWideDialog(page: Page, dialog: Locator) {
  const box = await dialog.boundingBox()
  expect(box, 'dialog box').toBeTruthy()
  expect(box!.width, 'the create dialog uses a sensible width').toBeGreaterThanOrEqual(600)
  expect(box!.width).toBeLessThanOrEqual(640)
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  const ends = dialog.getByTestId('link-ends')
  expect(await ends.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  for (const name of ['Cancel', 'Confirm']) {
    const button = dialog.getByRole('button', { name, exact: true })
    await expect(button).toBeVisible()
    const buttonBox = await button.boundingBox()
    expect(buttonBox, `${name} box`).toBeTruthy()
    expect(buttonBox!.x).toBeGreaterThanOrEqual(box!.x)
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(box!.x + box!.width)
    expect(buttonBox!.y).toBeGreaterThanOrEqual(box!.y)
    expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(box!.y + box!.height)
  }
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(900)
}

async function confirmAndCleanup(page: Page, dialog: Locator) {
  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await dialog.getByTestId('link-create-confirm').click()
  const body = (await (await created).json()) as { id?: string }
  await expect(dialog).toHaveCount(0)
  expect(body.id, 'created link id').toBeTruthy()
  const removed = await page.request.delete(`/v1/links/${body.id}`)
  expect(removed.ok()).toBe(true)
}

async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

test('Detail and Graph create dialogs are wide enough to confirm without forcing', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)

  await openObjectDetail(page, PRODUCT)
  await openSectionPicker(page, 'Suppliers')
  const detailDialog = await chooseSupplier(page)
  await expectWideDialog(page, detailDialog)
  await shot(page, 'detail-dialog-wide')
  await confirmAndCleanup(page, detailDialog)

  await openObjectGraph(page, PRODUCT)
  const { menu } = await openNodeMenu(page, PRODUCT.id)
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  const graphDialog = await chooseSupplier(page)
  await expectWideDialog(page, graphDialog)
  await shot(page, 'graph-dialog-wide')
  await confirmAndCleanup(page, graphDialog)
})

test('the Graph dialog stays centred over the viewport like Detail', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await openObjectGraph(page, PRODUCT)

  const avoid = await nodeAvoid(page, PRODUCT.id)
  expect(avoid.x, 'product node sits near the right edge').toBeGreaterThan(1200)
  const { menu } = await openNodeMenu(page, PRODUCT.id)
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  const dialog = await chooseSupplier(page)

  const box = await dialog.boundingBox()
  expect(box, 'dialog box').toBeTruthy()
  expect(Math.abs(box!.x + box!.width / 2 - 720)).toBeLessThanOrEqual(2)
  expect(Math.abs(box!.y + box!.height / 2 - 450)).toBeLessThanOrEqual(2)
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(1440)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(900)
  expect(overlaps(box!, avoid), 'centred dialog must not cover the clicked node').toBe(false)
  await shot(page, 'graph-dialog-centred')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('a focused node keeps focus through menu and picker and never scrolls the legend', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await openObjectGraph(page, ARTICLE)

  const node = await nodeMarker(page, PRODUCT.id)
  const legend = page.locator('.graph-legend')
  await expect(legend).toBeVisible()
  const legendScroll = () => legend.evaluate((element) => element.scrollLeft)
  expect(await legendScroll()).toBe(0)
  const chips = legend.locator('.legend-chip')
  const chipCount = await chips.count()
  expect(chipCount).toBeGreaterThan(1)

  await node.focus()
  await expect(node).toBeFocused()
  expect(await legendScroll(), 'focusing a node must not scroll the legend').toBe(0)
  for (let index = 0; index < chipCount; index += 1) await expect(chips.nth(index)).toBeVisible()

  for (const key of ['Control+Enter', 'Shift+F10', 'ContextMenu']) {
    await node.focus()
    await expect(node).toBeFocused()
    await page.keyboard.press(key)
    const menu = page.getByTestId('context-menu')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(node, `Escape from the menu opened with ${key} returns focus to the node`).toBeFocused()
    expect(await legendScroll()).toBe(0)
  }

  await node.focus()
  await page.keyboard.press('Control+Enter')
  await expect(page.getByTestId('context-menu')).toBeVisible()
  await page.keyboard.press('Enter')
  const picker = page.getByTestId('link-picker')
  await expect(picker).toBeVisible()
  await expect(page.getByTestId('link-search')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(node, 'Escape from the picker returns focus to the node').toBeFocused()
  expect(await legendScroll()).toBe(0)
  for (let index = 0; index < chipCount; index += 1) await expect(chips.nth(index)).toBeVisible()
})

test('a newly created link shows its relation label on a readable graph', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)
  await openObjectGraph(page, PRODUCT)
  const edges = page.getByTestId('graph-edges').locator('[data-edge-id]')
  const before = await edges.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-edge-id') ?? ''))
  await expect(edges.first()).toBeVisible()

  const { menu } = await openNodeMenu(page, PRODUCT.id)
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  const dialog = await chooseSupplier(page)
  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await dialog.getByTestId('link-create-confirm').click()
  const body = (await (await created).json()) as { id?: string }
  await expect(dialog).toHaveCount(0)
  expect(body.id, 'created link id').toBeTruthy()

  await expect
    .poll(async () => edges.evaluateAll((elements) => elements.length), { timeout: 30_000 })
    .toBeGreaterThan(before.length)
  const after = await edges.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-edge-id') ?? ''))
  const newId = after.find((id) => !before.includes(id))
  expect(newId, 'new edge id').toBeTruthy()
  const edge = page.getByTestId('graph-edges').locator(`[data-edge-id="${newId}"]`)
  await expect(edge).toContainText('Supplier')

  const canvas = page.locator('canvas[data-testid=graph]')
  const zoom = Number(await canvas.getAttribute('data-zoom'))
  if (zoom < 0.6) {
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox, 'canvas box').toBeTruthy()
    await page.mouse.move(canvasBox!.x + canvasBox!.width / 2, canvasBox!.y + canvasBox!.height / 2)
    for (let index = 0; index < 10; index += 1) await page.mouse.wheel(0, -300)
    await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThanOrEqual(0.6)
  }

  const marker = await nodeAvoid(page, PRODUCT.id)
  await page.mouse.move(marker.x, marker.y)
  await expect(edge, 'the relation label is drawn for the active endpoint').toHaveAttribute('data-shown', 'true', {
    timeout: 15_000,
  })
  const label = (await edge.innerText()).trim()
  expect(label).toMatch(/^[A-Z]/)
  await shot(page, 'edge-label-visible')

  const removed = await page.request.delete(`/v1/links/${body.id}`)
  expect(removed.ok()).toBe(true)
})

test('the right-edge node menu avoids every circle and label and labels stay inside the pane', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await openObjectGraph(page, ARTICLE)

  const stage = await page.getByTestId('graph-stage').boundingBox()
  expect(stage, 'graph stage box').toBeTruthy()
  const nodes = await nodeRects(page)
  expect(nodes.length).toBeGreaterThan(3)
  for (const node of nodes) {
    expect(node.label.left, `${node.id} label left inside the pane`).toBeGreaterThanOrEqual(stage!.x - 1)
    expect(node.label.right, `${node.id} label right inside the pane`).toBeLessThanOrEqual(stage!.x + stage!.width + 1)
    expect(node.label.top, `${node.id} label top inside the pane`).toBeGreaterThanOrEqual(stage!.y - 1)
    expect(node.label.bottom, `${node.id} label bottom inside the pane`).toBeLessThanOrEqual(stage!.y + stage!.height + 1)
  }

  const avoid = await nodeAvoid(page, PRODUCT.id)
  expect(avoid.x, 'product node sits near the right edge').toBeGreaterThan(1200)
  const productLabel = await labelRect(await nodeMarker(page, PRODUCT.id))
  expect(productLabel.right).toBeLessThanOrEqual(stage!.x + stage!.width + 1)

  const { menu } = await openNodeMenu(page, PRODUCT.id)
  const menuBox = await menu.boundingBox()
  expect(menuBox, 'menu box').toBeTruthy()
  for (const node of nodes) {
    expect(overlaps(menuBox!, node.circle), `menu must not cover ${node.id} circle`).toBe(false)
    expect(overlaps(menuBox!, node.label), `menu must not cover ${node.id} label`).toBe(false)
  }
  expect(menuBox!.x).toBeGreaterThanOrEqual(0)
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(1440)
  expect(menuBox!.y).toBeGreaterThanOrEqual(0)
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(900)
  await shot(page, 'right-edge-menu-clear')
  await page.keyboard.press('Escape')
})
