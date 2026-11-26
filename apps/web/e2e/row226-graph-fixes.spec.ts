import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { paneWithTab } from './ui'

const PRODUCT = { key: 'PROD-CHOC', id: '018f1000-0000-7000-8000-000000000014' }
const ARTICLE = { key: 'ART-CHOC-100', id: '018f1000-0000-7000-8000-000000000025' }
const SUPPLIER = { id: '018f1000-0000-7000-8000-000000000002' }
const GROUP = 'group:food:chocolate'

const ARTICLE_MENU = ['Link Product…', 'Link Supplier…', 'Link Replaced by…', 'Link Replaces…']
const PRODUCT_MENU = ['Link Articles…', 'Link Suppliers…']

const shots = process.env.BRAIAN_ROW226_SHOTS
  ? resolve(process.env.BRAIAN_ROW226_SHOTS)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row226-shots')

const VIEW = {
  tree: '018f2000-0000-7000-8000-000000000301',
  products: '018f2000-0000-7000-8000-000000000302',
  articles: '018f2000-0000-7000-8000-000000000310',
  detail: '018f2000-0000-7000-8000-000000000303',
  graph: '018f2000-0000-7000-8000-000000000304',
}

type Rect = { left: number; top: number; right: number; bottom: number }
type Box = { x: number; y: number; width: number; height: number }
type LayoutNode =
  | { type: 'tabs'; views: string[]; active: number }
  | { type: 'split'; dir: 'horizontal' | 'vertical'; ratios: number[]; children: LayoutNode[] }

const tabs = (view: string): LayoutNode => ({ type: 'tabs', views: [view], active: 0 })
const split = (dir: 'horizontal' | 'vertical', ratios: number[], children: LayoutNode[]): LayoutNode => ({
  type: 'split',
  dir,
  ratios,
  children,
})

const wideGraphLayout = split('horizontal', [0.14, 0.34, 0.52], [
  tabs(VIEW.tree),
  split('vertical', [0.52, 0.48], [tabs(VIEW.products), tabs(VIEW.detail)]),
  tabs(VIEW.graph),
])

async function shot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, `${name}.png`) })
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
}

async function applyLayout(page: Page, layout: LayoutNode, workspaceName = 'Products') {
  const me = (await (await page.request.get('/v1/me')).json()) as { user_id?: string; id?: string }
  const userId = me.user_id ?? me.id ?? ''
  const listed = (await (await page.request.get('/v1/workspaces')).json()) as {
    workspaces: Array<{ id: string; name: string }>
  }
  const workspace = listed.workspaces.find((item) => item.name === workspaceName)
  if (!workspace) throw new Error(`missing ${workspaceName} workspace`)
  await page.evaluate(
    ({ user, id, name, next: node }) => {
      sessionStorage.setItem('braian.layout.suppressFlush', '1')
      localStorage.setItem(
        `braian.layout.${user}.default.${id}`,
        JSON.stringify({
          document: { id, title: name, layout: node, focus: node.type === 'tabs' ? node.views[0] : undefined },
          savedAt: Date.now() + 60_000,
        }),
      )
    },
    { user: userId, id: workspace.id, name: workspace.name, next: layout },
  )
  await page.reload()
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
  await expect(page.getByTestId('dock')).toBeVisible()
  if (workspaceName !== 'Products') {
    await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${workspaceName}`) }).click()
    await expect(page.getByTestId('dock')).toBeVisible()
  }
}

function graphCanvas(page: Page) {
  return page.locator('canvas[data-testid=graph]')
}

async function waitGraph(page: Page) {
  const canvas = graphCanvas(page)
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 40_000 })
  await expect.poll(async () => canvas.getAttribute('data-settling'), { timeout: 60_000 }).not.toBe('true')
}

async function openGraph(page: Page, title: string, key: string) {
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${title}`) }).click()
  const pane = paneWithTab(page, title)
  await pane.getByTestId('quick-filter').fill(key)
  const row = pane.getByTestId('object-row').filter({ hasText: key }).first()
  await expect(row).toBeVisible()
  await row.click()
  if ((await graphCanvas(page).count()) === 0) {
    const graphTab = page.locator('.pane-tab', { hasText: 'Graph' }).first()
    if ((await graphTab.count()) > 0) await graphTab.click()
  }
  await waitGraph(page)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(300)
}

function graphNode(page: Page, fullId: string) {
  return page.getByTestId('graph-nodes').locator(`[data-node-id="${fullId}"]`)
}

async function nodeMarker(page: Page, fullId: string) {
  const node = graphNode(page, fullId)
  await expect(node).toHaveCount(1)
  await expect(node).toHaveAttribute('data-x', /^-?\d+$/, { timeout: 30_000 })
  await expect(node).toHaveAttribute('data-y', /^-?\d+$/, { timeout: 30_000 })
  return {
    x: Number(await node.getAttribute('data-x')),
    y: Number(await node.getAttribute('data-y')),
    r: Number(await node.getAttribute('data-r')),
    label: {
      left: Number(await node.getAttribute('data-label-left')),
      top: Number(await node.getAttribute('data-label-top')),
      right: Number(await node.getAttribute('data-label-right')),
      bottom: Number(await node.getAttribute('data-label-bottom')),
    },
  }
}

function nodeBox(marker: { x: number; y: number; r: number; label: Rect }): Rect {
  return {
    left: Math.min(marker.x - marker.r, marker.label.left),
    top: Math.min(marker.y - marker.r, marker.label.top),
    right: Math.max(marker.x + marker.r, marker.label.right),
    bottom: Math.max(marker.y + marker.r, marker.label.bottom),
  }
}

function gapTo(box: Box, rect: Rect) {
  const dx = Math.max(box.x - rect.right, rect.left - (box.x + box.width), 0)
  const dy = Math.max(box.y - rect.bottom, rect.top - (box.y + box.height), 0)
  return Math.hypot(dx, dy)
}

function overlaps(a: Rect, b: Box | Rect, slack = 1) {
  const bx = 'x' in b ? b.x : b.left
  const by = 'y' in b ? b.y : b.top
  const br = 'x' in b ? b.x + b.width : b.right
  const bb = 'y' in b ? b.y + b.height : b.bottom
  return a.left < br - slack && a.right > bx + slack && a.top < bb - slack && a.bottom > by + slack
}

async function menuEntries(page: Page) {
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  return (await menu.getByRole('menuitem').allInnerTexts()).map((text) => text.trim())
}

async function expectMenuHugs(page: Page, nodeId: string, expected: string[], label: string) {
  const marker = await nodeMarker(page, nodeId)
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  const entries = await menuEntries(page)
  expect(entries, `${label} right-click menu`).toEqual(expected)
  const menuBox = (await page.getByTestId('context-menu').boundingBox())!
  expect(gapTo(menuBox, nodeBox(marker)), `${label} right-click menu hugs the node`).toBeLessThanOrEqual(16)
  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  expect(menuBox.x).toBeGreaterThanOrEqual(stage.x - 1)
  expect(menuBox.y).toBeGreaterThanOrEqual(stage.y - 1)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(stage.x + stage.width + 1)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(stage.y + stage.height + 1)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
  const ring = page.getByTestId('graph-focus-ring')
  await expect(ring).toBeVisible()
  await expect(ring).toHaveAttribute('data-node-id', nodeId)

  await graphNode(page, nodeId).focus()
  await page.keyboard.press('Shift+F10')
  const keyboardEntries = await menuEntries(page)
  expect(keyboardEntries, `${label} Shift+F10 menu`).toEqual(expected)
  const keyboardBox = (await page.getByTestId('context-menu').boundingBox())!
  expect(gapTo(keyboardBox, nodeBox(marker)), `${label} Shift+F10 menu hugs the node`).toBeLessThanOrEqual(16)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
}

async function clickNode(page: Page, nodeId: string) {
  const marker = await nodeMarker(page, nodeId)
  await page.mouse.click(marker.x, marker.y)
  await page.waitForTimeout(200)
}

async function previewZoom(page: Page) {
  return Number(await graphCanvas(page).getAttribute('data-zoom'))
}

async function zoomWithWheel(page: Page, up: boolean) {
  const box = (await graphCanvas(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < 5; index += 1) await page.mouse.wheel(0, up ? -300 : 300)
  await page.mouse.move(4, 4)
  await waitGraph(page)
  await page.waitForTimeout(300)
}

async function visibleNodeBoxes(page: Page) {
  return page
    .getByTestId('graph-nodes')
    .locator('[data-node-id][data-x]')
    .evaluateAll((elements) =>
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
          left: Math.min(x - r, label.left),
          top: Math.min(y - r, label.top),
          right: Math.max(x + r, label.right),
          bottom: Math.max(y + r, label.bottom),
        }
      }),
    )
}

async function expectAllInside(page: Page, why: string) {
  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  for (const box of await visibleNodeBoxes(page)) {
    expect(box.left, `${why}: ${box.id} clipped left`).toBeGreaterThanOrEqual(stage.x - 1)
    expect(box.right, `${why}: ${box.id} clipped right`).toBeLessThanOrEqual(stage.x + stage.width + 1)
    expect(box.top, `${why}: ${box.id} clipped top`).toBeGreaterThanOrEqual(stage.y - 1)
    expect(box.bottom, `${why}: ${box.id} clipped bottom`).toBeLessThanOrEqual(stage.y + stage.height + 1)
  }
}

async function foodNodeLabel(page: Page) {
  const node = page
    .getByTestId('graph-nodes')
    .locator('[data-node-id^="group:"]')
    .filter({ hasText: 'Food' })
    .first()
  if ((await node.count()) === 0) return undefined
  return {
    left: Number(await node.getAttribute('data-label-left')),
    right: Number(await node.getAttribute('data-label-right')),
    top: Number(await node.getAttribute('data-label-top')),
    bottom: Number(await node.getAttribute('data-label-bottom')),
  }
}

type EdgeRow = Rect & { id: string; source: string; target: string; label: string; shown: boolean }

async function edgeRows(page: Page): Promise<EdgeRow[]> {
  return page
    .getByTestId('graph-edges')
    .locator('[data-edge-id]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-edge-id') ?? '',
        source: element.getAttribute('data-source') ?? '',
        target: element.getAttribute('data-target') ?? '',
        label: (element.textContent ?? '').trim(),
        shown: element.getAttribute('data-shown') === 'true' && element.hasAttribute('data-label-left'),
        left: Number(element.getAttribute('data-label-left')),
        top: Number(element.getAttribute('data-label-top')),
        right: Number(element.getAttribute('data-label-right')),
        bottom: Number(element.getAttribute('data-label-bottom')),
      })),
    )
}

async function nodeLabelRects(page: Page): Promise<Array<Rect & { id: string }>> {
  return page
    .getByTestId('graph-nodes')
    .locator('[data-node-id][data-label-shown="true"]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-node-id') ?? '',
        left: Number(element.getAttribute('data-label-left')),
        top: Number(element.getAttribute('data-label-top')),
        right: Number(element.getAttribute('data-label-right')),
        bottom: Number(element.getAttribute('data-label-bottom')),
      })),
    )
}

function expectClearLabels(edges: EdgeRow[], nodes: Array<Rect & { id: string }>) {
  const shown = edges.filter((edge) => edge.shown)
  for (let index = 0; index < shown.length; index += 1) {
    expect(shown[index]!.label, `painted edge label ${shown[index]!.id}`).not.toBe('')
    for (let other = index + 1; other < shown.length; other += 1) {
      expect(
        overlaps(shown[index]!, shown[other]!),
        `edge labels ${shown[index]!.id} and ${shown[other]!.id} overlap`,
      ).toBe(false)
    }
    for (const label of nodes) {
      expect(
        overlaps(shown[index]!, label),
        `edge label ${shown[index]!.id} overlaps caption ${label.id}`,
      ).toBe(false)
    }
  }
  for (let index = 0; index < nodes.length; index += 1) {
    for (let other = index + 1; other < nodes.length; other += 1) {
      expect(overlaps(nodes[index]!, nodes[other]!), `captions ${nodes[index]!.id}/${nodes[other]!.id}`).toBe(false)
    }
  }
}

test('a click keeps a pinned node pinned and a drag still pins it', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)

  await clickNode(page, `object:${PRODUCT.id}`)
  const card = page.getByTestId('graph-inspector')
  await expect(card).toContainText('PROD-CHOC')
  await card.getByTestId('graph-pin').click()
  await expect(card.getByTestId('graph-unpin')).toBeVisible()

  const before = await nodeMarker(page, `object:${PRODUCT.id}`)
  await shot(page, 'g4-pinned-before-click')
  await page.mouse.click(before.x, before.y)
  await page.waitForTimeout(300)
  await expect(card.getByTestId('graph-unpin'), 'a click must not release the pin').toBeVisible()
  await expect(card.getByTestId('graph-pin')).toHaveCount(0)
  const after = await nodeMarker(page, `object:${PRODUCT.id}`)
  expect(
    Math.hypot(after.x - before.x, after.y - before.y),
    'a click on a pinned node must not move it',
  ).toBeLessThanOrEqual(2)
  await shot(page, 'g4-pinned-after-click')

  // Only Unpin releases the pin.
  await card.getByTestId('graph-unpin').click()
  await expect(card.getByTestId('graph-pin')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(card.getByTestId('graph-pin')).toBeVisible()

  // Drag-to-pin still pins the node where it is dropped.
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.move(marker.x, marker.y)
  await page.mouse.down()
  await page.mouse.move(marker.x + 60, marker.y + 40, { steps: 12 })
  await page.mouse.up()
  await waitGraph(page)
  await expect(card.getByTestId('graph-unpin')).toBeVisible()
  await shot(page, 'g4-pinned-after-drag')
})

test('the camera fits on load, after F5 and after leaving full size until the user moves it', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)

  await expectAllInside(page, 'first load')
  const firstFood = await foodNodeLabel(page)
  const firstStage = (await page.getByTestId('graph-stage').boundingBox())!
  if (firstFood) expect(firstFood.left, 'Food caption on first load').toBeGreaterThanOrEqual(firstStage.x - 1)
  await shot(page, 'g3-g5-F5-load-fit')

  // Re-layout gives a stable, freshly fitted camera to compare the full-size
  // round trip against.
  await page.getByTestId('graph-relayout').click()
  await waitGraph(page)
  await page.waitForTimeout(700)
  await expectAllInside(page, 'after Re-layout')
  const paneZoom = await previewZoom(page)

  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  await page.waitForTimeout(700)
  await expectAllInside(page, 'entering full size')
  await shot(page, 'g3-full-size-fit')

  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
  await waitGraph(page)
  await page.waitForTimeout(700)
  await expectAllInside(page, 'leaving full size')
  expect(await previewZoom(page), 'leaving full size refits while untouched').toBeCloseTo(paneZoom, 2)
  await shot(page, 'g3-after-close-fullscreen-fit')

  // A full reload must fit again, including a Food caption at the left edge.
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(800)
  await expectAllInside(page, 'after F5')
  const loadedFood = await foodNodeLabel(page)
  const loadedStage = (await page.getByTestId('graph-stage').boundingBox())!
  if (loadedFood) expect(loadedFood.left, 'Food caption after F5').toBeGreaterThanOrEqual(loadedStage.x - 1)
  await shot(page, 'g3-g5-F5-load-after-reload')

  // Once the user zooms, a resize or full-size toggle keeps their camera.
  const loadedZoom = await previewZoom(page)
  await zoomWithWheel(page, true)
  const userZoom = await previewZoom(page)
  expect(Math.abs(userZoom - loadedZoom) / loadedZoom, 'the test zoomed away from the fit').toBeGreaterThan(0.02)
  await page.setViewportSize({ width: 1100, height: 820 })
  await page.waitForTimeout(700)
  expect(await previewZoom(page), 'resize after a user zoom').toBeCloseTo(userZoom, 2)
  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await page.waitForTimeout(500)
  expect(await previewZoom(page), 'full size after a user zoom').toBeCloseTo(userZoom, 2)
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await page.waitForTimeout(500)
  expect(await previewZoom(page), 'closing full size after a user zoom').toBeCloseTo(userZoom, 2)
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('the hub and article menus hug the node in the pane and in full size', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)

  for (const id of ['value', 'group', 'structure', 'class']) {
    const chip = page.getByTestId(`legend-${id}`)
    if ((await chip.count()) > 0) await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }
  await expectMenuHugs(page, `object:${PRODUCT.id}`, PRODUCT_MENU, 'hub')
  await shot(page, 'g2-hub-menu-pane')

  await openGraph(page, 'Articles', ARTICLE.key)
  await expectMenuHugs(page, `object:${ARTICLE.id}`, ARTICLE_MENU, 'article')
  await shot(page, 'g2-article-menu-pane')

  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  await page.waitForTimeout(700)
  for (const id of ['value', 'group', 'structure', 'class']) {
    const chip = page.getByTestId(`legend-${id}`)
    if ((await chip.count()) > 0) await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }
  await expectMenuHugs(page, `object:${ARTICLE.id}`, ARTICLE_MENU, 'article full size')
  await shot(page, 'g2-article-menu-full')
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
})

test('a group node gets its own menu and the hub is hittable at its centre in full size', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Articles', ARTICLE.key)

  let group = graphNode(page, GROUP)
  if ((await group.count()) === 0) {
    group = page
      .getByTestId('graph-nodes')
      .locator('[data-node-id^="group:"]')
      .filter({ hasText: 'Chocolate' })
      .first()
  }
  await expect(group).toHaveCount(1)
  await expect(group).toHaveAttribute('data-x', /^-?\d+$/, { timeout: 30_000 })
  await expect(group).toHaveAttribute('data-y', /^-?\d+$/, { timeout: 30_000 })
  const groupMarker = {
    x: Number(await group.getAttribute('data-x')),
    y: Number(await group.getAttribute('data-y')),
  }
  const objectsBefore = await page.getByTestId('graph-nodes').locator('[data-node-id^="object:"]').count()
  await page.mouse.click(groupMarker.x, groupMarker.y, { button: 'right' })
  const groupEntries = await menuEntries(page)
  expect(groupEntries, 'a group node opens its own menu, not the canvas menu').toContain('Show members')
  expect(groupEntries).not.toEqual(['Fit', 'Re-layout'])
  await shot(page, 'g1-group-node-own-menu')
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Show members' }).click()
  await expect
    .poll(async () => page.getByTestId('graph-nodes').locator('[data-node-id^="object:"]').count(), { timeout: 30_000 })
    .toBeGreaterThan(objectsBefore)
  await waitGraph(page)
  await shot(page, 'g1-group-members-expanded')

  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  await page.waitForTimeout(700)
  const hub = await nodeMarker(page, `object:${ARTICLE.id}`)
  await page.mouse.click(hub.x, hub.y, { button: 'right' })
  expect(await menuEntries(page), 'a centre right-click in full size opens the hub menu').toEqual(ARTICLE_MENU)
  await shot(page, 'g2-hub-rightclick-fullscreen-centre')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
})

test('hovered and selected edge labels stay clear of every caption', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Articles', ARTICLE.key)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(400)

  const atRest = await edgeRows(page)
  if (atRest.length <= 10) {
    expect(atRest.filter((edge) => edge.shown).length, 'a sparse graph labels at rest').toBeGreaterThan(0)
  }
  expectClearLabels(atRest, await nodeLabelRects(page))
  await shot(page, 'g5-edge-labels-at-rest')

  const article = `object:${ARTICLE.id}`
  await clickNode(page, article)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(300)
  const selected = await edgeRows(page)
  const attached = selected.filter((edge) => edge.source === article || edge.target === article)
  const shownLabels = new Set(selected.filter((edge) => edge.shown).map((edge) => edge.label))
  expect(attached.length, 'the article has edges').toBeGreaterThan(0)
  for (const edge of attached) expect(shownLabels, `selected edge ${edge.label} is painted`).toContain(edge.label)
  expectClearLabels(selected, await nodeLabelRects(page))
  await shot(page, 'g5-edge-labels-selected')

  const supplier = await nodeMarker(page, `object:${SUPPLIER.id}`)
  await page.mouse.move(supplier.x, supplier.y)
  await page.waitForTimeout(400)
  const hovered = await edgeRows(page)
  const supplierEdges = hovered.filter(
    (edge) => edge.source === `object:${SUPPLIER.id}` || edge.target === `object:${SUPPLIER.id}`,
  )
  const hoveredLabels = new Set(hovered.filter((edge) => edge.shown).map((edge) => edge.label))
  expect(supplierEdges.length, 'the supplier has edges').toBeGreaterThan(0)
  for (const edge of supplierEdges) expect(hoveredLabels, `hovered edge ${edge.label} is painted`).toContain(edge.label)
  expectClearLabels(hovered, await nodeLabelRects(page))
  await shot(page, 'g5-edge-labels-hovered')
  await page.mouse.move(4, 4)
})
