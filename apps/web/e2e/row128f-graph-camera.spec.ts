import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { paneWithTab } from './ui'

const PRODUCT = { key: 'PROD-CHOC', id: '018f1000-0000-7000-8000-000000000014' }
const ARTICLE = { key: 'ART-CHOC-100', id: '018f1000-0000-7000-8000-000000000025' }

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

async function localNodePositions(page: Page): Promise<Record<string, { x: number; y: number }>> {
  const canvasBox = await graphCanvas(page).boundingBox()
  if (!canvasBox) throw new Error('no canvas box')
  const rows = await page
    .getByTestId('graph-nodes')
    .locator('[data-node-id][data-x]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-node-id') ?? '',
        x: Number(element.getAttribute('data-x')),
        y: Number(element.getAttribute('data-y')),
      })),
    )
  return Object.fromEntries(rows.map((row) => [row.id, { x: row.x - canvasBox.x, y: row.y - canvasBox.y }]))
}

function maxMove(before: Record<string, { x: number; y: number }>, after: Record<string, { x: number; y: number }>) {
  let max = 0
  for (const id of Object.keys(before)) {
    if (!after[id]) continue
    max = Math.max(max, Math.abs(after[id]!.x - before[id]!.x), Math.abs(after[id]!.y - before[id]!.y))
  }
  return max
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
        label: element.textContent ?? '',
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

function overlaps(a: Rect, b: Box | Rect, slack = 1) {
  const bx = 'x' in b ? b.x : b.left
  const by = 'y' in b ? b.y : b.top
  const br = 'x' in b ? b.x + b.width : b.right
  const bb = 'y' in b ? b.y + b.height : b.bottom
  return a.left < br - slack && a.right > bx + slack && a.top < bb - slack && a.bottom > by + slack
}

function expectClearLabelSet(edges: EdgeRow[], nodes: Array<Rect & { id: string }>) {
  const shown = edges.filter((edge) => edge.shown)
  for (let index = 0; index < shown.length; index += 1) {
    for (let other = index + 1; other < shown.length; other += 1) {
      expect(
        overlaps(shown[index]!, shown[other]!),
        `edge labels ${shown[index]!.id} and ${shown[other]!.id} overlap`,
      ).toBe(false)
    }
    for (const label of nodes) {
      expect(
        overlaps(shown[index]!, label),
        `edge label ${shown[index]!.id} overlaps node label ${label.id}`,
      ).toBe(false)
    }
  }
  for (let index = 0; index < nodes.length; index += 1) {
    for (let other = index + 1; other < nodes.length; other += 1) {
      expect(overlaps(nodes[index]!, nodes[other]!), `node labels ${nodes[index]!.id}/${nodes[other]!.id}`).toBe(false)
    }
  }
}

function gapTo(box: Box, rect: Rect) {
  const dx = Math.max(box.x - rect.right, rect.left - (box.x + box.width), 0)
  const dy = Math.max(box.y - rect.bottom, rect.top - (box.y + box.height), 0)
  return Math.hypot(dx, dy)
}

function nodeBox(marker: { x: number; y: number; r: number; label: Rect }): Rect {
  return {
    left: Math.min(marker.x - marker.r, marker.label.left),
    top: Math.min(marker.y - marker.r, marker.label.top),
    right: Math.max(marker.x + marker.r, marker.label.right),
    bottom: Math.max(marker.y + marker.r, marker.label.bottom),
  }
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
  await search.pressSequentially(key, { delay: 15 })
  await expect(search).toHaveValue(key)
}

async function previewZoom(page: Page) {
  return Number(await graphCanvas(page).getAttribute('data-zoom'))
}

async function zoomOut(page: Page, times = 6) {
  const box = await graphCanvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < times; index += 1) await page.mouse.wheel(0, 300)
  await page.mouse.move(4, 4)
  await waitGraph(page)
}

async function zoomIn(page: Page, times = 8) {
  const box = await graphCanvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < times; index += 1) await page.mouse.wheel(0, -300)
  await page.mouse.move(4, 4)
  await waitGraph(page)
}

async function discardOwnProposals(page: Page, ids: Set<string>) {
  if (ids.size === 0) return
  const listed = await page.request.get('/v1/proposals?status=open&limit=200')
  if (!listed.ok()) return
  const body = (await listed.json()) as { proposals?: Array<{ id?: string }> }
  for (const proposal of body.proposals ?? []) {
    if (proposal.id && ids.has(proposal.id)) {
      await page.request.post(`/v1/proposals/${proposal.id}/discard`).catch(() => undefined)
    }
  }
}

test('the camera stays put through drag, select, hover, focus, unpin, fullscreen and resize', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)

  await zoomIn(page)
  const zoomBefore = await previewZoom(page)
  expect(zoomBefore).toBeGreaterThan(0.6)

  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.move(marker.x, marker.y)
  await page.mouse.down()
  await page.mouse.move(marker.x + 60, marker.y + 40, { steps: 12 })
  await page.mouse.up()
  await waitGraph(page)
  const zoomAfterDrag = await previewZoom(page)
  expect(Math.abs(zoomAfterDrag - zoomBefore) / zoomBefore, 'a node drag must not move the camera').toBeLessThan(0.03)
  expect((await edgeRows(page)).filter((edge) => edge.shown).length, 'labels survive the drag').toBeGreaterThan(0)

  // Unpin only releases the node: the whole layout and camera stay put.
  const beforeUnpin = await localNodePositions(page)
  await expect(page.getByTestId('graph-unpin')).toBeVisible()
  await page.getByTestId('graph-unpin').click()
  await page.waitForTimeout(500)
  expect(maxMove(beforeUnpin, await localNodePositions(page)), 'Unpin must not re-layout').toBeLessThanOrEqual(1)
  expect(await previewZoom(page)).toBeCloseTo(zoomAfterDrag, 2)

  const nodes = await page
    .getByTestId('graph-nodes')
    .locator('[data-node-id][data-x]')
    .evaluateAll((elements) =>
      elements.map((element) => ({
        id: element.getAttribute('data-node-id') ?? '',
        x: Number(element.getAttribute('data-x')),
        y: Number(element.getAttribute('data-y')),
      })),
    )
  const other = nodes.find((node) => node.id.startsWith('object:') && node.id !== `object:${PRODUCT.id}`) ?? nodes[0]!
  const canvasBox = (await graphCanvas(page).boundingBox())!

  const beforeClick = await localNodePositions(page)
  await page.mouse.click(other.x, other.y)
  await page.waitForTimeout(400)
  expect(maxMove(beforeClick, await localNodePositions(page)), 'selecting a node must not move the hub').toBeLessThanOrEqual(1)
  expect(await previewZoom(page)).toBeCloseTo(zoomAfterDrag, 2)

  const beforeHover = await localNodePositions(page)
  await page.mouse.move(other.x + 2, other.y + 2)
  await page.waitForTimeout(300)
  expect(maxMove(beforeHover, await localNodePositions(page)), 'hover must not re-layout').toBeLessThanOrEqual(1)
  await page.mouse.move(4, 4)

  const beforeFocus = await localNodePositions(page)
  await graphNode(page, `object:${PRODUCT.id}`).focus()
  await page.waitForTimeout(300)
  expect(maxMove(beforeFocus, await localNodePositions(page)), 'focus must not re-layout').toBeLessThanOrEqual(1)
  expect(canvasBox.width).toBeGreaterThan(0)

  const beforeFull = await localNodePositions(page)
  const zoomBeforeFull = await previewZoom(page)
  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await page.waitForTimeout(400)
  expect(await previewZoom(page), 'opening full size keeps the camera').toBeCloseTo(zoomBeforeFull, 2)
  const fullCanvas = (await graphCanvas(page).boundingBox())!
  const fullPositions = await localNodePositions(page)
  for (const id of Object.keys(beforeFull)) {
    if (!fullPositions[id]) continue
    expect(Math.abs(fullPositions[id]!.x - beforeFull[id]!.x), `${id} x in fullscreen`).toBeLessThanOrEqual(1)
    expect(Math.abs(fullPositions[id]!.y - beforeFull[id]!.y), `${id} y in fullscreen`).toBeLessThanOrEqual(1)
  }
  expect(fullCanvas.width).toBeGreaterThan(canvasBox.width)

  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await page.waitForTimeout(400)
  expect(await previewZoom(page), 'closing full size keeps the camera').toBeCloseTo(zoomBeforeFull, 2)
  const closedPositions = await localNodePositions(page)
  for (const id of Object.keys(beforeFull)) {
    if (!closedPositions[id]) continue
    expect(Math.abs(closedPositions[id]!.x - beforeFull[id]!.x), `${id} x after closing`).toBeLessThanOrEqual(1)
    expect(Math.abs(closedPositions[id]!.y - beforeFull[id]!.y), `${id} y after closing`).toBeLessThanOrEqual(1)
  }

  // A pane resize (inspector growth / viewport change) must not refit either.
  await page.setViewportSize({ width: 1100, height: 820 })
  await page.waitForTimeout(500)
  expect(await previewZoom(page), 'a resize after the user zoomed keeps the camera').toBeCloseTo(zoomBeforeFull, 2)
  await page.setViewportSize({ width: 1440, height: 900 })
})

test('edge labels are named at rest and on the focused node without stacking', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(500)

  const first = await edgeRows(page)
  const attachedLabels = new Set(
    first
      .filter((edge) => edge.source === `object:${PRODUCT.id}` || edge.target === `object:${PRODUCT.id}`)
      .map((edge) => edge.label),
  )
  const shownLabels = new Set(first.filter((edge) => edge.shown).map((edge) => edge.label))
  expect(shownLabels.size, 'the selected node keeps its relation labels at the fitted zoom').toBeGreaterThan(0)
  for (const label of attachedLabels) expect(shownLabels, `selected edge label ${label}`).toContain(label)
  expectClearLabelSet(first, await nodeLabelRects(page))

  await zoomIn(page, 6)
  expect((await edgeRows(page)).filter((edge) => edge.shown).length).toBeGreaterThan(0)
  expectClearLabelSet(await edgeRows(page), await nodeLabelRects(page))

  // A focused neighbour labels its own edges, without a mouse hover.
  await page.mouse.move(4, 4)
  const neighbour = first.find(
    (edge) =>
      (edge.source === `object:${PRODUCT.id}` && edge.target.startsWith('object:')) ||
      (edge.target === `object:${PRODUCT.id}` && edge.source.startsWith('object:')),
  )
  expect(neighbour, 'a linked object node').toBeTruthy()
  const neighbourId = neighbour!.source === `object:${PRODUCT.id}` ? neighbour!.target : neighbour!.source
  const neighbourLabels = new Set(
    first
      .filter((edge) => edge.source === neighbourId || edge.target === neighbourId)
      .map((edge) => edge.label),
  )
  await graphNode(page, neighbourId).focus()
  await expect
    .poll(async () => {
      const rows = await edgeRows(page)
      const shown = new Set(rows.filter((edge) => edge.shown).map((edge) => edge.label))
      return [...neighbourLabels].every((label) => shown.has(label))
    }, { timeout: 10_000 })
    .toBe(true)

  // A small graph is labelled at its fitted default zoom, without zooming in.
  await openGraph(page, 'Articles', ARTICLE.key)
  await page.mouse.move(4, 4)
  await page.waitForTimeout(500)
  const smallRows = await edgeRows(page)
  expect(smallRows.filter((edge) => edge.shown).length, 'small graphs show labels at rest').toBeGreaterThan(0)
  expectClearLabelSet(smallRows, await nodeLabelRects(page))
})

test('a narrow pane reaches the canvas and nodes by Tab, arrows, Shift+F10 and Esc', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, smallGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)
  await page.setViewportSize({ width: 1000, height: 900 })

  const canvas = graphCanvas(page)
  await canvas.focus()
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('graph')

  let reachedNode = false
  for (let step = 0; step < 40 && !reachedNode; step += 1) {
    await page.keyboard.press('Tab')
    reachedNode = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[data-testid="graph-nodes"]') && document.activeElement?.getAttribute('data-node-id')),
    )
  }
  expect(reachedNode, 'Tab reaches the graph nodes').toBe(true)

  await canvas.focus()
  const selectedBefore = await page.locator('[data-testid="graph-nodes"] [data-selected="true"]').getAttribute('data-node-id')
  let selectedAfter = selectedBefore
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await page.keyboard.press(key)
    await page.waitForTimeout(150)
    selectedAfter = await page.locator('[data-testid="graph-nodes"] [data-selected="true"]').getAttribute('data-node-id')
    if (selectedAfter && selectedAfter !== selectedBefore) break
  }
  expect(selectedAfter, 'arrow keys move the selection').not.toBe(selectedBefore)

  await page.evaluate(() => {
    const target = window as Window & { __graphKeyPrevented?: boolean }
    target.__graphKeyPrevented = false
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'F10' && event.shiftKey) {
          // Capture runs before React; read defaultPrevented after it bubbles.
          setTimeout(() => {
            target.__graphKeyPrevented = event.defaultPrevented
          }, 0)
        }
      },
      true,
    )
  })

  const valueNode = page.getByTestId('graph-nodes').locator('[data-node-id^="value:"]').first()
  await expect(valueNode).toHaveCount(1)
  await valueNode.focus()
  await page.keyboard.press('Shift+F10')
  await page.waitForTimeout(100)
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as Window & { __graphKeyPrevented?: boolean }).__graphKeyPrevented),
    'Shift+F10 on a value node is consumed, not the browser menu',
  ).toBe(true)

  await canvas.focus()
  for (let step = 0; step < 3; step += 1) {
    if ((await page.locator('[data-testid="graph-nodes"] [data-selected="true"]').count()) === 0) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(100)
  }
  expect(await page.locator('[data-testid="graph-nodes"] [data-selected="true"]').count()).toBe(0)
  await page.keyboard.press('Shift+F10')
  await page.waitForTimeout(100)
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
  expect(
    await page.evaluate(() => (window as Window & { __graphKeyPrevented?: boolean }).__graphKeyPrevented),
    'Shift+F10 on an empty canvas is consumed',
  ).toBe(true)

  // A mouse-opened menu returns focus (and a visible ring) to the node on Esc.
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  const productNode = graphNode(page, `object:${PRODUCT.id}`)
  await expect(productNode).toBeFocused()
  const ring = page.getByTestId('graph-focus-ring')
  await expect(ring).toBeVisible()
  await expect(ring).toHaveAttribute('data-node-id', `object:${PRODUCT.id}`)
})

test('node labels stay inside the pane at the edge', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)
  await page.setViewportSize({ width: 1000, height: 900 })

  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  const inside = (rect: Rect) =>
    rect.left >= stage.x - 1 &&
    rect.right <= stage.x + stage.width + 1 &&
    rect.top >= stage.y - 1 &&
    rect.bottom <= stage.y + stage.height + 1

  for (const label of await nodeLabelRects(page)) expect(inside(label), `${label.id} is clipped`).toBe(true)

  // Pan the camera: labels clamp to the pane instead of leaving a clipped plate.
  const canvas = (await graphCanvas(page).boundingBox())!
  await page.mouse.move(canvas.x + 6, canvas.y + 6)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 110, canvas.y + 110, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  for (const label of await nodeLabelRects(page)) expect(inside(label), `${label.id} after pan is clipped`).toBe(true)

  // Drag the hub onto the bottom edge: the caption flips above and stays inside.
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.move(marker.x, marker.y)
  await page.mouse.down()
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height - 10, { steps: 12 })
  await page.mouse.up()
  await waitGraph(page)
  const moved = await nodeMarker(page, `object:${PRODUCT.id}`)
  expect(inside(moved.label), 'a node label on the bottom edge is not clipped').toBe(true)
})

test('the legend and the link count update at once after Add link and Remove link', async ({ page }) => {
  test.setTimeout(300_000)
  const proposals = new Set<string>()
  let createdLink = ''
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()

  const sides = (await (await page.request.get(`/v1/links?object=${PRODUCT.id}`)).json()) as Array<{
    links?: Array<{ peer_id?: string }>
  }>
  const linked = new Set((sides ?? []).flatMap((side) => (side.links ?? []).map((link) => String(link.peer_id ?? ''))))
  const searched = (await (await page.request.get('/v1/search?q=*&filter=type_key:=supplier&per_page=100')).json()) as {
    hits?: Array<{ id?: string; key?: string; document?: { id?: string; key?: string } }>
  }
  const supplier = (searched.hits ?? [])
    .map((hit) => hit.document ?? hit)
    .find((hit) => hit.id && hit.key && !linked.has(hit.id)) as { id: string; key: string } | undefined
  expect(supplier, 'an unlinked supplier').toBeTruthy()

  const legendTotal = async () =>
    (await page.locator('.graph-legend .legend-chip').allInnerTexts())
      .map((text) => text.match(/\d+/g)?.map(Number) ?? [])
      .flat()
      .reduce((total, value) => total + value, 0)
  const linkRows = () => detail.getByTestId('link-row').count()
  const rowsBefore = await linkRows()
  const legendBefore = await legendTotal()

  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await page.mouse.click(marker.x, marker.y, { button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Link Suppliers…', exact: true }).click()
  await typeSupplier(page, supplier!.key)
  await clickCentre(page, await pickerOption(page, supplier!.key))
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await dialog.getByTestId('link-create-confirm').click()
  const body = (await (await created).json()) as { id?: string; proposal_id?: string }
  createdLink = String(body.id ?? '')
  if (body.proposal_id) proposals.add(String(body.proposal_id))
  await expect(dialog).toHaveCount(0)

  await expect.poll(linkRows, { timeout: 30_000 }).toBe(rowsBefore + 1)
  await expect.poll(legendTotal, { timeout: 30_000 }).toBe(legendBefore + 1)

  const row = detail.getByTestId('link-row').filter({ hasText: supplier!.key }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click({ button: 'right' })
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Remove link' }).click()
  const confirm = page.getByTestId('link-confirm')
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.getByTestId('link-confirm-remove').click()
    await expect(confirm).toBeHidden()
  }
  await expect.poll(linkRows, { timeout: 30_000 }).toBe(rowsBefore)
  await expect.poll(legendTotal, { timeout: 30_000 }).toBe(legendBefore)
  if (createdLink) {
    await page.request.delete(`/v1/links/${createdLink}`).catch(() => undefined)
    createdLink = ''
  }
  await discardOwnProposals(page, proposals)
})

test('the full-size graph keeps its picker and menu above the surface and the menu hugs the node', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  await page.mouse.move(4, 4)
  // Hide the low-priority value captions so there is genuinely free space next
  // to the hub; the menu may only move further out when a label blocks it.
  await zoomOut(page, 6)

  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  const box = nodeBox(marker)
  const productNode = graphNode(page, `object:${PRODUCT.id}`)
  await productNode.focus()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  const menuBox = (await menu.boundingBox())!
  expect(menuBox.x).toBeGreaterThanOrEqual(stage.x - 1)
  expect(menuBox.y).toBeGreaterThanOrEqual(stage.y - 1)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(stage.x + stage.width + 1)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(stage.y + stage.height + 1)
  expect(gapTo(menuBox, box), 'the menu is close, never the old corner').toBeLessThanOrEqual(96)
  for (const label of await edgeRows(page)) {
    if (label.shown) expect(overlaps(label, menuBox), `menu covers edge label ${label.id}`).toBe(false)
  }
  for (const label of await nodeLabelRects(page)) {
    expect(overlaps(label, menuBox), `menu covers node label ${label.id}`).toBe(false)
  }
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await page.getByRole('button', { name: 'Fit', exact: true }).click()
  await waitGraph(page)
  await zoomOut(page, 6)

  const fullStage = (await page.getByTestId('graph-stage').boundingBox())!
  expect(fullStage.width).toBeGreaterThan(stage.width)
  const fullMarker = await nodeMarker(page, `object:${PRODUCT.id}`)
  await graphNode(page, `object:${PRODUCT.id}`).focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  const fullMenuBox = (await menu.boundingBox())!
  expect(fullMenuBox.x).toBeGreaterThanOrEqual(fullStage.x - 1)
  expect(fullMenuBox.y).toBeGreaterThanOrEqual(fullStage.y - 1)
  expect(fullMenuBox.x + fullMenuBox.width).toBeLessThanOrEqual(fullStage.x + fullStage.width + 1)
  expect(fullMenuBox.y + fullMenuBox.height).toBeLessThanOrEqual(fullStage.y + fullStage.height + 1)
  expect(
    await menu.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    'the menu is above the fixed full-size graph',
  ).toBeGreaterThan(await page.getByTestId('graph-full').evaluate((element) => Number(getComputedStyle(element).zIndex)))
  const menuHit = await page.evaluate(
    ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="context-menu"]')),
    { x: fullMenuBox.x + fullMenuBox.width / 2, y: fullMenuBox.y + fullMenuBox.height / 2 },
  )
  expect(menuHit, 'the menu is reachable above the full-size graph').toBe(true)

  await menu.getByRole('menuitem', { name: 'Link Articles…', exact: true }).click()
  const picker = page.getByTestId('link-picker')
  await expect(picker).toBeVisible()
  await page.getByTestId('link-search').pressSequentially('ART-', { delay: 15 })
  const option = picker.getByRole('option').first()
  await expect(option).toBeVisible()
  const optionBox = (await option.boundingBox())!
  const pickerHit = await page.evaluate(
    ({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('[data-testid="link-picker"]')),
    { x: optionBox.x + optionBox.width / 2, y: optionBox.y + optionBox.height / 2 },
  )
  expect(pickerHit, 'the picker is clickable above the full-size graph').toBe(true)
  expect(
    await picker.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    'the picker is above the fixed full-size graph',
  ).toBeGreaterThan(await page.getByTestId('graph-full').evaluate((element) => Number(getComputedStyle(element).zIndex)))

  await clickCentre(page, option)
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  expect(
    await dialog.evaluate((element) => Number(getComputedStyle(element).zIndex)),
    'the create dialog is above the fixed full-size graph',
  ).toBeGreaterThan(await page.getByTestId('graph-full').evaluate((element) => Number(getComputedStyle(element).zIndex)))
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
})


test('the menu hugs the node when the pane has free space', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await applyLayout(page, wideGraphLayout)
  await openGraph(page, 'Products', PRODUCT.key)
  // Hide the value/group/structure captions so the hub genuinely has free
  // space; the menu must then sit within the allowed 16 px of the node edge.
  for (const id of ['value', 'group', 'structure', 'class']) {
    const chip = page.getByTestId(`legend-${id}`)
    if ((await chip.count()) > 0) await chip.click()
  }
  await page.mouse.move(4, 4)
  await page.waitForTimeout(400)

  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  const marker = await nodeMarker(page, `object:${PRODUCT.id}`)
  const box = nodeBox(marker)
  await graphNode(page, `object:${PRODUCT.id}`).focus()
  await page.keyboard.press('Shift+F10')
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  const menuBox = (await menu.boundingBox())!
  expect(gapTo(menuBox, box), 'the menu hugs a node with free space').toBeLessThanOrEqual(16)
  for (const label of await edgeRows(page)) {
    if (label.shown) expect(overlaps(label, menuBox), `menu covers edge label ${label.id}`).toBe(false)
  }
  for (const label of await nodeLabelRects(page)) {
    expect(overlaps(label, menuBox), `menu covers node label ${label.id}`).toBe(false)
  }
  expect(menuBox.x).toBeGreaterThanOrEqual(stage.x - 1)
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(stage.x + stage.width + 1)
  expect(menuBox.y).toBeGreaterThanOrEqual(stage.y - 1)
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(stage.y + stage.height + 1)
  await page.keyboard.press('Escape')
})
