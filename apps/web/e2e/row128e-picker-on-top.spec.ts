import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { paneWithTab } from './ui'

const PRODUCT = { key: 'PROD-CHOC', id: '018f1000-0000-7000-8000-000000000014' }
const NORTHMILL = { key: 'SUP-NORTH', name: 'Northmill Foods' }
const COAST = { key: 'SUP-COAST', name: 'Coastline Supply' }

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

/** Left tree, middle column with Products over Detail, wide Graph on the right. */
const wideGraphLayout = split('horizontal', [0.14, 0.34, 0.52], [
  tabs(VIEW.tree),
  split('vertical', [0.52, 0.48], [tabs(VIEW.products), tabs(VIEW.detail)]),
  tabs(VIEW.graph),
])

/** Five panes side by side; the Graph pane is about 200 px wide. */
const smallGraphLayout = split('horizontal', [0.13, 0.2, 0.2, 0.33, 0.14], [
  tabs(VIEW.tree),
  tabs(VIEW.products),
  tabs(VIEW.articles),
  tabs(VIEW.detail),
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

async function applyLayout(page: Page, layout: LayoutNode) {
  const me = (await (await page.request.get('/v1/me')).json()) as { user_id?: string; id?: string }
  const userId = me.user_id ?? me.id ?? ''
  const listed = (await (await page.request.get('/v1/workspaces')).json()) as {
    workspaces: Array<{ id: string; name: string }>
  }
  const workspace = listed.workspaces.find((item) => item.name === 'Products')
  if (!workspace) throw new Error('missing Products workspace')
  // Paint this layout locally. A future timestamp beats any server copy and a
  // layout flush from the page we leave is suppressed, so the next load is
  // deterministic even when a previous test used another split.
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
  await expect(paneWithTab(page, 'Products')).toBeVisible()
}

async function selectProduct(page: Page) {
  const pane = paneWithTab(page, 'Products')
  await pane.getByTestId('quick-filter').fill(PRODUCT.key)
  const row = pane.getByTestId('object-row').filter({ hasText: PRODUCT.key }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(row).toHaveAttribute('aria-selected', 'true')
}

function graphCanvas(page: Page) {
  return page.locator('canvas[data-testid=graph]')
}

async function waitGraph(page: Page) {
  const canvas = graphCanvas(page)
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })
  await expect.poll(async () => canvas.getAttribute('data-settling'), { timeout: 60_000 }).not.toBe('true')
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
  }
}

async function detailAddLink(page: Page, section: string) {
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  const card = detail.getByTestId('link-section').filter({ has: page.locator('h3', { hasText: section }) })
  const button = card.getByTestId('add-link')
  await button.click()
  return button
}

async function pickerOption(page: Page, key: string) {
  const option = page.getByTestId('link-picker').getByRole('option').filter({ hasText: key }).first()
  await expect(option).toBeVisible()
  return option
}

async function clickCentre(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  expect(box, 'clickable box').toBeTruthy()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
}

async function typeSupplier(page: Page, key: string) {
  const search = page.getByTestId('link-search')
  await expect(search).toBeFocused()
  await search.pressSequentially(key, { delay: 20 })
  await expect(search).toHaveValue(key)
}

async function createAndCleanup(page: Page) {
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await dialog.getByTestId('link-create-confirm').click()
  const body = (await (await created).json()) as { id?: string }
  await expect(dialog).toHaveCount(0)
  expect(body.id, 'created link id').toBeTruthy()
  const removed = await page.request.delete(`/v1/links/${body.id}`)
  expect(removed.ok()).toBe(true)
  return body.id!
}

async function edgeRects(page: Page) {
  return page
    .getByTestId('graph-edges')
    .locator('[data-edge-id]')
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getAttribute('data-shown') === 'true' && element.hasAttribute('data-label-left'))
        .map((element) => ({
          id: element.getAttribute('data-edge-id') ?? '',
          left: Number(element.getAttribute('data-label-left')),
          top: Number(element.getAttribute('data-label-top')),
          right: Number(element.getAttribute('data-label-right')),
          bottom: Number(element.getAttribute('data-label-bottom')),
        })),
    )
}

async function nodeLabelRects(page: Page) {
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

function overlaps(a: Rect, b: Box | Rect, slack = 2) {
  const bx = 'x' in b ? b.x : b.left
  const by = 'y' in b ? b.y : b.top
  const br = 'x' in b ? b.x + b.width : b.right
  const bb = 'y' in b ? b.y + b.height : b.bottom
  return a.left < br - slack && a.right > bx + slack && a.top < bb - slack && a.bottom > by + slack
}

function rectOverlaps(a: Rect, b: Rect, slack = 2) {
  return overlaps(a, b, slack)
}

function expectClearLabelSet(edges: Array<Rect & { id: string }>, nodes: Array<Rect & { id: string }>) {
  for (let index = 0; index < edges.length; index += 1) {
    for (let other = index + 1; other < edges.length; other += 1) {
      expect(
        rectOverlaps(edges[index]!, edges[other]!),
        `edge labels ${edges[index]!.id} and ${edges[other]!.id} overlap`,
      ).toBe(false)
    }
    for (const label of nodes) {
      expect(
        rectOverlaps(edges[index]!, label),
        `edge label ${edges[index]!.id} ${JSON.stringify(edges[index])} overlaps node label ${label.id} ${JSON.stringify(label)}`,
      ).toBe(false)
    }
  }
  for (let index = 0; index < nodes.length; index += 1) {
    for (let other = index + 1; other < nodes.length; other += 1) {
      expect(
        rectOverlaps(nodes[index]!, nodes[other]!),
        `node labels ${nodes[index]!.id} ${JSON.stringify(nodes[index])} and ${nodes[other]!.id} ${JSON.stringify(nodes[other])} overlap`,
      ).toBe(false)
    }
  }
}

async function nodePositions(page: Page) {
  return page
    .getByTestId('graph-nodes')
    .locator('[data-node-id][data-x]')
    .evaluateAll((elements) =>
      Object.fromEntries(
        elements.map((element) => [
          element.getAttribute('data-node-id') ?? '',
          {
            x: Number(element.getAttribute('data-x')),
            y: Number(element.getAttribute('data-y')),
          },
        ]),
      ) as Record<string, { x: number; y: number }>,
    )
}

test('the Detail picker is portalled above every pane and the mouse can type and choose in it', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await selectProduct(page)
  await expect(page.locator('section.pane')).toHaveCount(4)

  const addLink = await detailAddLink(page, 'Suppliers')
  const picker = page.getByTestId('link-picker')
  await expect(picker).toBeVisible()
  expect(
    await picker.evaluate((element) => Boolean(element.closest('section.pane'))),
    'the picker must not live inside a pane',
  ).toBe(false)
  expect(await picker.evaluate((element) => element.parentElement?.tagName)).toBe('BODY')

  // Tab is trapped inside the picker. Esc closes and returns to the opener.
  await expect(page.getByTestId('link-search')).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="link-picker"]')))).toBe(true)
  await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="link-picker"]')))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(picker).toHaveCount(0)
  await expect(addLink).toBeFocused()

  // Overlay click closes it too.
  await addLink.click()
  await expect(picker).toBeVisible()
  await page.mouse.click(8, 8)
  await expect(picker).toHaveCount(0)

  // Reopen and type with the keyboard: the table filter behind must not steal it.
  await addLink.click()
  await expect(picker).toBeVisible()
  const quickFilter = paneWithTab(page, 'Products').getByTestId('quick-filter')
  const filterBefore = await quickFilter.inputValue()
  await typeSupplier(page, NORTHMILL.key)
  await expect(quickFilter).toHaveValue(filterBefore)
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('link-search')

  const option = await pickerOption(page, NORTHMILL.key)
  const optionBox = await option.boundingBox()
  expect(optionBox, 'option box').toBeTruthy()
  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y)
      return {
        inPicker: Boolean(element?.closest('[data-testid="link-picker"]')),
        tag: element?.tagName ?? '',
      }
    },
    { x: optionBox!.x + optionBox!.width / 2, y: optionBox!.y + optionBox!.height / 2 },
  )
  expect(hit.inPicker, `elementFromPoint hit ${hit.tag}, not the picker`).toBe(true)

  await clickCentre(page, option)
  await createAndCleanup(page)

  // The Graph node menu opens the same portalled picker in the same multi-pane workspace.
  await waitGraph(page)
  const node = graphNode(page, `object:${PRODUCT.id}`)
  await node.focus()
  await expect(node).toBeFocused()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await expect(picker).toBeVisible()
  expect(await picker.evaluate((element) => element.parentElement?.tagName)).toBe('BODY')
  await typeSupplier(page, COAST.key)
  await clickCentre(page, await pickerOption(page, COAST.key))
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(node).toBeFocused()
})

test('edge labels are visible at rest, never stack, and existing nodes stay put while a new node joins', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await selectProduct(page)
  await waitGraph(page)
  await page.mouse.move(4, 4)

  // Labels at rest, without a hover move over the canvas.
  await expect
    .poll(async () => (await edgeRects(page)).length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const restingEdges = await edgeRects(page)
  const restingNodes = await nodeLabelRects(page)
  expectClearLabelSet(restingEdges, restingNodes)

  const beforePositions = await nodePositions(page)
  const beforeIds = Object.keys(beforePositions)
  const beforeEdges = await page.getByTestId('graph-edges').locator('[data-edge-id]').count()

  // Add one link from the Graph menu. The new node lands beside its neighbour;
  // every existing node keeps its exact screen position.
  const node = graphNode(page, `object:${PRODUCT.id}`)
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await typeSupplier(page, COAST.key)
  await clickCentre(page, await pickerOption(page, COAST.key))
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await dialog.getByTestId('link-create-confirm').click()
  const link = (await (await created).json()) as { id?: string }
  await expect(dialog).toHaveCount(0)

  await expect
    .poll(async () => page.getByTestId('graph-edges').locator('[data-edge-id]').count(), { timeout: 30_000 })
    .toBeGreaterThan(beforeEdges)
  await waitGraph(page)

  const afterPositions = await nodePositions(page)
  for (const id of beforeIds) {
    if (!afterPositions[id]) continue
    expect(Math.abs(afterPositions[id]!.x - beforePositions[id]!.x), `${id} x moved`).toBeLessThanOrEqual(2)
    expect(Math.abs(afterPositions[id]!.y - beforePositions[id]!.y), `${id} y moved`).toBeLessThanOrEqual(2)
  }
  const addedIds = Object.keys(afterPositions).filter((id) => !beforeIds.includes(id))
  expect(addedIds.length, 'the new supplier node').toBeGreaterThan(0)
  const productAfter = afterPositions[`object:${PRODUCT.id}`]!
  const nearest = Math.min(
    ...addedIds.map((id) => Math.hypot(afterPositions[id]!.x - productAfter.x, afterPositions[id]!.y - productAfter.y)),
  )
  expect(nearest, 'the new node is placed near its neighbour').toBeLessThan(320)

  const movedLabelSet = await edgeRects(page)
  expectClearLabelSet(movedLabelSet, await nodeLabelRects(page))

  // Dragging a node keeps its edge label attached and leaves no stale plate.
  const shown = page.getByTestId('graph-edges').locator('[data-edge-id][data-shown="true"][data-label-left]')
  const candidates = await shown.evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute('data-edge-id') ?? '',
      source: element.getAttribute('data-source') ?? '',
      target: element.getAttribute('data-target') ?? '',
      left: Number(element.getAttribute('data-label-left')),
      top: Number(element.getAttribute('data-label-top')),
      right: Number(element.getAttribute('data-label-right')),
      bottom: Number(element.getAttribute('data-label-bottom')),
    })),
  )
  const attached = candidates.find(
    (edge) => edge.source === `object:${PRODUCT.id}` || edge.target === `object:${PRODUCT.id}`,
  )
  expect(attached, 'an edge label attached to the dragged node').toBeTruthy()
  const productMarker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.move(productMarker.x, productMarker.y)
  await page.mouse.down()
  await page.mouse.move(productMarker.x + 70, productMarker.y - 40, { steps: 12 })
  await page.mouse.up()
  await waitGraph(page)
  await expect
    .poll(async () => {
      const edge = page.getByTestId('graph-edges').locator(`[data-edge-id="${attached!.id}"]`)
      return (await edge.getAttribute('data-shown')) === 'true' && (await edge.getAttribute('data-label-left')) != null
    }, { timeout: 20_000 })
    .toBe(true)
  const movedEdge = page.getByTestId('graph-edges').locator(`[data-edge-id="${attached!.id}"]`)
  const movedLeft = Number(await movedEdge.getAttribute('data-label-left'))
  const movedTop = Number(await movedEdge.getAttribute('data-label-top'))
  expect(
    Math.hypot(movedLeft - attached!.left, movedTop - attached!.top),
    'the label follows its edge when the node moves',
  ).toBeGreaterThan(8)
  expectClearLabelSet(await edgeRects(page), await nodeLabelRects(page))

  const removed = await page.request.delete(`/v1/links/${link.id}`)
  expect(removed.ok()).toBe(true)
})

test('the keyboard and right-click menus open beside the node, avoid every label and stay inside a small Graph pane', async ({ page }) => {
  test.setTimeout(240_000)
  await login(page)
  await applyLayout(page, smallGraphLayout)
  await selectProduct(page)
  await waitGraph(page)
  await page.mouse.move(4, 4)
  await expect(page.locator('section.pane')).toHaveCount(5)

  const stage = await page.getByTestId('graph-stage').boundingBox()
  expect(stage, 'graph stage box').toBeTruthy()
  expect(stage!.width, 'the Graph pane is genuinely small').toBeLessThan(260)

  const node = graphNode(page, `object:${PRODUCT.id}`)
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  const label = {
    left: Number(await node.getAttribute('data-label-left')),
    top: Number(await node.getAttribute('data-label-top')),
    right: Number(await node.getAttribute('data-label-right')),
    bottom: Number(await node.getAttribute('data-label-bottom')),
  }
  const nodeBox = {
    left: Math.min(marker.x - marker.r, label.left),
    top: Math.min(marker.y - marker.r, label.top),
    right: Math.max(marker.x + marker.r, label.right),
    bottom: Math.max(marker.y + marker.r, label.bottom),
  }

  const assertMenu = async (menu: Locator) => {
    const box = await menu.boundingBox()
    expect(box, 'menu box').toBeTruthy()
    expect(box!.x, 'menu stays inside the small pane').toBeGreaterThanOrEqual(stage!.x - 1)
    expect(box!.x + box!.width).toBeLessThanOrEqual(stage!.x + stage!.width + 1)
    expect(box!.y).toBeGreaterThanOrEqual(stage!.y - 1)
    expect(box!.y + box!.height).toBeLessThanOrEqual(stage!.y + stage!.height + 1)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(1440)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(900)
    const gapX = Math.max(box!.x - nodeBox.right, nodeBox.left - (box!.x + box!.width), 0)
    const gapY = Math.max(box!.y - nodeBox.bottom, nodeBox.top - (box!.y + box!.height), 0)
    expect(Math.hypot(gapX, gapY), 'the menu opens next to the node').toBeLessThanOrEqual(96)
    const edges = await edgeRects(page)
    const labels = await nodeLabelRects(page)
    for (const rect of edges) expect(overlaps(rect, box!), `menu covers edge label ${rect.id}`).toBe(false)
    for (const rect of labels) expect(overlaps(rect, box!), `menu covers node label ${rect.id}`).toBe(false)
  }

  await node.focus()
  await expect(node).toBeFocused()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await assertMenu(menu)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(node).toBeFocused()

  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  await expect(menu).toBeVisible()
  await assertMenu(menu)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  expectClearLabelSet(await edgeRects(page), await nodeLabelRects(page))
})
