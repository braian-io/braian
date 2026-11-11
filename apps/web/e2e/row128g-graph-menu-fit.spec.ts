import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { paneWithTab } from './ui'

const PRODUCT = { key: 'PROD-CHOC', id: '018f1000-0000-7000-8000-000000000014' }
const ARTICLE = { title: 'Articles', key: 'ART-CHOC-100', id: '018f1000-0000-7000-8000-000000000025' }
const SUPPLIER = { id: '018f1000-0000-7000-8000-000000000002' }

const ARTICLE_MENU = ['Link Product…', 'Link Supplier…', 'Link Replaced by…', 'Link Replaces…']
const PRODUCT_MENU = ['Link Articles…', 'Link Suppliers…']
const SUPPLIER_MENU = ['Link Articles…', 'Link Product…']

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

async function expectMenuHugs(page: Page, nodeId: string, expected: string[]) {
  const marker = await nodeMarker(page, nodeId)
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  const entries = await menuEntries(page)
  expect(entries, `${nodeId} right-click menu`).toEqual(expected)
  const menuBox = (await page.getByTestId('context-menu').boundingBox())!
  expect(gapTo(menuBox, nodeBox(marker)), `${nodeId} right-click menu hugs the node`).toBeLessThanOrEqual(16)
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
  expect(keyboardEntries, `${nodeId} Shift+F10 menu`).toEqual(expected)
  const keyboardBox = (await page.getByTestId('context-menu').boundingBox())!
  expect(gapTo(keyboardBox, nodeBox(marker)), `${nodeId} Shift+F10 menu hugs the node`).toBeLessThanOrEqual(16)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
  await expect(page.getByTestId('graph-focus-ring')).toHaveAttribute('data-node-id', nodeId)
}

async function clickNode(page: Page, nodeId: string) {
  const marker = await nodeMarker(page, nodeId)
  await page.mouse.click(marker.x, marker.y)
  await page.waitForTimeout(150)
}

async function previewZoom(page: Page) {
  return Number(await graphCanvas(page).getAttribute('data-zoom'))
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

async function graphExtent(page: Page) {
  const boxes = await visibleNodeBoxes(page)
  const left = Math.min(...boxes.map((box) => box.left))
  const right = Math.max(...boxes.map((box) => box.right))
  const top = Math.min(...boxes.map((box) => box.top))
  const bottom = Math.max(...boxes.map((box) => box.bottom))
  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  return { width: (right - left) / stage.width, height: (bottom - top) / stage.height }
}

async function setZoomWithWheel(page: Page, up: boolean) {
  const box = (await graphCanvas(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < 5; index += 1) await page.mouse.wheel(0, up ? -300 : 300)
  await page.mouse.move(4, 4)
  await waitGraph(page)
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

test('a value, article and supplier node each open their own menu beside themselves', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, ARTICLE.title, ARTICLE.key)

  const valueId = await page
    .getByTestId('graph-nodes')
    .locator('[data-node-id^="value:"]')
    .first()
    .getAttribute('data-node-id')
  expect(valueId, 'a value node').toBeTruthy()

  await expectMenuHugs(page, `object:${ARTICLE.id}`, ARTICLE_MENU)
  await expectMenuHugs(page, `object:${SUPPLIER.id}`, SUPPLIER_MENU)
  await expectMenuHugs(page, valueId!, await menuEntriesFor(page, valueId!))

  // A mouse click must move keyboard focus to that node, so the next
  // Shift+F10 opens the clicked node's menu instead of an older keyboard node.
  await graphNode(page, `object:${ARTICLE.id}`).focus()
  const product = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.click(product.x, product.y)
  await expect(graphNode(page, `object:${PRODUCT.id}`)).toBeFocused()
  await page.keyboard.press('Shift+F10')
  expect(await menuEntries(page), 'Shift+F10 after a mouse click').toEqual(PRODUCT_MENU)
  const menuBox = (await page.getByTestId('context-menu').boundingBox())!
  expect(gapTo(menuBox, nodeBox(product)), 'the clicked node owns the menu').toBeLessThanOrEqual(16)
  await page.keyboard.press('Escape')
})

async function menuEntriesFor(page: Page, nodeId: string) {
  const marker = await nodeMarker(page, nodeId)
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  const entries = await menuEntries(page)
  await page.keyboard.press('Escape')
  return entries
}

test('the menu hugs the node with the legend visible in a pane and in maximised view', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, ARTICLE.title, ARTICLE.key)

  for (const id of ['value', 'group', 'structure', 'class']) {
    const chip = page.getByTestId(`legend-${id}`)
    if ((await chip.count()) > 0) await expect(chip).toHaveAttribute('aria-pressed', 'true')
  }

  const valueId = await page
    .getByTestId('graph-nodes')
    .locator('[data-node-id^="value:"]')
    .first()
    .getAttribute('data-node-id')
  await expectMenuHugs(page, `object:${ARTICLE.id}`, ARTICLE_MENU)
  await expectMenuHugs(page, `object:${SUPPLIER.id}`, SUPPLIER_MENU)
  await expectMenuHugs(page, valueId!, await menuEntriesFor(page, valueId!))

  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  const fullStage = (await page.getByTestId('graph-stage').boundingBox())!
  const paneStage = fullStage
  expect(paneStage.width).toBeGreaterThan(800)
  const chip = page.getByTestId('legend-value')
  if ((await chip.count()) > 0) await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expectMenuHugs(page, `object:${ARTICLE.id}`, ARTICLE_MENU)
  await expectMenuHugs(page, `object:${SUPPLIER.id}`, SUPPLIER_MENU)
  await expectMenuHugs(page, valueId!, await menuEntriesFor(page, valueId!))
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
})

test('the camera fits until the user zooms or pans', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await expectAllInside(page, 'first load')

  await page.getByTestId('graph-relayout').click()
  await expect(graphCanvas(page)).toHaveAttribute('data-settled', 'false')
  await waitGraph(page)
  await expectAllInside(page, 'after Re-layout')

  const beforeFull = await previewZoom(page)
  const beforeExtent = await graphExtent(page)
  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  await page.waitForTimeout(600)
  await expectAllInside(page, 'entering full size')
  const fullExtent = await graphExtent(page)
  expect(fullExtent.height, 'full size fits the graph to the taller canvas').toBeGreaterThan(beforeExtent.height + 0.05)
  expect(await previewZoom(page), 'entering full size refits').not.toBeCloseTo(beforeFull, 2)
  const fullZoom = await previewZoom(page)
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
  await waitGraph(page)
  await page.waitForTimeout(600)
  await expectAllInside(page, 'leaving full size')
  expect(await previewZoom(page), 'leaving full size refits').toBeCloseTo(beforeFull, 2)

  // A pane resize refits while the camera is still untouched.
  await page.setViewportSize({ width: 1000, height: 900 })
  await waitGraph(page)
  await page.waitForTimeout(600)
  await expectAllInside(page, 'pane resize')

  // After a real zoom the camera belongs to the user: resize, full size and a
  // node drag must not snap it back.
  await page.setViewportSize({ width: 1440, height: 900 })
  await waitGraph(page)
  await setZoomWithWheel(page, false)
  const userZoom = await previewZoom(page)
  expect(Math.abs(userZoom - fullZoom) / fullZoom, 'the test zoomed away from the fit').toBeGreaterThan(0.02)
  await page.setViewportSize({ width: 1100, height: 820 })
  await page.waitForTimeout(500)
  expect(await previewZoom(page), 'resize after a user zoom').toBeCloseTo(userZoom, 2)
  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await page.waitForTimeout(400)
  expect(await previewZoom(page), 'full size after a user zoom').toBeCloseTo(userZoom, 2)
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await page.waitForTimeout(400)
  expect(await previewZoom(page), 'closing full size after a user zoom').toBeCloseTo(userZoom, 2)

  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.move(marker.x, marker.y)
  await page.mouse.down()
  await page.mouse.move(marker.x + 60, marker.y + 40, { steps: 12 })
  await page.mouse.up()
  await waitGraph(page)
  expect(await previewZoom(page), 'a node drag must not reset the camera').toBeCloseTo(userZoom, 2)
})

test('Pin stays on the card and toggles the same node', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)

  await clickNode(page, `object:${PRODUCT.id}`)
  const card = page.getByTestId('graph-inspector')
  await expect(card).toContainText('PROD-CHOC')
  await expect(card.getByTestId('graph-pin')).toBeVisible()
  await card.getByTestId('graph-pin').click()
  await expect(card.getByTestId('graph-unpin')).toBeVisible()
  await expect(card.getByTestId('graph-pin')).toHaveCount(0)
  await card.getByTestId('graph-unpin').click()
  await expect(card.getByTestId('graph-pin')).toBeVisible()
  await expect(card.getByTestId('graph-unpin')).toHaveCount(0)
  await card.getByTestId('graph-pin').click()
  await expect(card.getByTestId('graph-unpin')).toBeVisible()
  await expect(graphNode(page, `object:${PRODUCT.id}`)).toHaveAttribute('data-selected', 'true')
})

test('selected and hovered edges are painted without overlapping captions or each other', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, ARTICLE.title, ARTICLE.key)

  const atRest = await edgeRows(page)
  const sparse = atRest.length <= 10
  if (sparse) expect(atRest.filter((edge) => edge.shown).length, 'sparse graph labels at rest').toBeGreaterThan(0)
  expectClearLabels(atRest, await nodeLabelRects(page))

  const article = `object:${ARTICLE.id}`
  await clickNode(page, article)
  await page.mouse.move(4, 4)
  const selected = await edgeRows(page)
  const attached = selected.filter((edge) => edge.source === article || edge.target === article)
  const shownLabels = new Set(selected.filter((edge) => edge.shown).map((edge) => edge.label))
  expect(attached.length, 'the article has edges').toBeGreaterThan(0)
  for (const edge of attached) expect(shownLabels, `selected edge ${edge.label} is painted`).toContain(edge.label)
  expectClearLabels(selected, await nodeLabelRects(page))

  // Hover a neighbour without clicking: its edge labels must appear too.
  const supplier = await nodeMarker(page, `object:${SUPPLIER.id}`)
  await page.mouse.move(supplier.x, supplier.y)
  await page.waitForTimeout(300)
  const hovered = await edgeRows(page)
  const supplierEdges = hovered.filter(
    (edge) => edge.source === `object:${SUPPLIER.id}` || edge.target === `object:${SUPPLIER.id}`,
  )
  const hoveredLabels = new Set(hovered.filter((edge) => edge.shown).map((edge) => edge.label))
  expect(supplierEdges.length, 'the supplier has edges').toBeGreaterThan(0)
  for (const edge of supplierEdges) expect(hoveredLabels, `hovered edge ${edge.label} is painted`).toContain(edge.label)
  expectClearLabels(hovered, await nodeLabelRects(page))
  await page.mouse.move(4, 4)
})

test('right-click on empty canvas never opens Chrome menu and Esc leaves a focus ring', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)

  await page.evaluate(() => {
    const target = window as Window & { __ctxDefaultPrevented?: boolean }
    target.__ctxDefaultPrevented = undefined
    window.addEventListener(
      'contextmenu',
      (event) => {
        setTimeout(() => {
          target.__ctxDefaultPrevented = event.defaultPrevented
        }, 0)
      },
      false,
    )
  })

  const canvas = (await graphCanvas(page).boundingBox())!
  const boxes = await page.getByTestId('graph-nodes').locator('[data-node-id][data-x]').evaluateAll((elements) =>
    elements.map((element) => ({
      x: Number(element.getAttribute('data-x')),
      y: Number(element.getAttribute('data-y')),
      r: Number(element.getAttribute('data-r')),
    })),
  )
  const covered = await page.evaluate(() => {
    const nodes: Array<{ x: number; y: number; width: number; height: number }> = []
    for (const selector of ['.graph-inspector', '.graph-legend']) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) nodes.push({ x: rect.left, y: rect.top, width: rect.width, height: rect.height })
      }
    }
    return nodes
  })
  const insideOverlay = (x: number, y: number) =>
    covered.some((box) => x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height)
  let point: { x: number; y: number } | undefined
  for (let y = canvas.y + 40; y < canvas.y + canvas.height - 40 && !point; y += 20) {
    for (let x = canvas.x + 40; x < canvas.x + canvas.width - 40; x += 20) {
      if (insideOverlay(x, y)) continue
      const near = boxes.some((node) => Math.hypot(node.x - x, node.y - y) < node.r + 60)
      if (!near) {
        point = { x, y }
        break
      }
    }
  }
  expect(point, 'a free spot on the canvas').toBeTruthy()
  await page.mouse.click(point!.x, point!.y, { button: 'right' })
  await expect
    .poll(async () => page.evaluate(() => (window as Window & { __ctxDefaultPrevented?: boolean }).__ctxDefaultPrevented))
    .toBe(true)

  const menu = page.getByTestId('context-menu')
  if ((await menu.count()) > 0) {
    expect(await menuEntries(page), 'the empty-canvas menu is Fit / Re-layout').toEqual(['Fit', 'Re-layout'])
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(graphCanvas(page)).toBeFocused()
    const ring = await graphCanvas(page).evaluate((element) => {
      const style = getComputedStyle(element)
      return { style: style.outlineStyle, width: style.outlineWidth }
    })
    expect(ring.style, 'Esc leaves a visible canvas focus ring').not.toBe('none')
    expect(Number.parseFloat(ring.width), 'Esc leaves a visible canvas focus ring').toBeGreaterThan(0)
  } else {
    // "or nothing" is allowed, but never Chrome's own menu (proven above).
    await expect(menu).toHaveCount(0)
  }
})
