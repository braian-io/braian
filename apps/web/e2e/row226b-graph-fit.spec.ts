import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { paneWithTab } from './ui'

const ARTICLE = { key: 'ART-CHOC-100', id: '018f1000-0000-7000-8000-000000000025' }

type WorkspaceView = { id: string; type: string; title: string }
type Workspace = { id: string; name: string; views: WorkspaceView[] }

type Rect = { left: number; top: number; right: number; bottom: number }
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

function requiredView(workspace: Workspace, type: string, title?: string): string {
  const found = workspace.views.find(
    (view) => view.type === type && (title === undefined || view.title === title),
  )
  if (!found) {
    const wanted = title ? `${type} "${title}"` : type
    throw new Error(`workspace ${workspace.name} has no ${wanted} view`)
  }
  return found.id
}

/** Left tree, article list, detail, and a graph pane about 230 px wide. */
function narrowGraphLayout(workspace: Workspace): LayoutNode {
  const articles = tabs(requiredView(workspace, 'object_table', 'Articles'))
  const detail = tabs(requiredView(workspace, 'object_detail'))
  const graph = tabs(requiredView(workspace, 'graph'))
  const tree = workspace.views.find((view) => view.type === 'structure_tree')
  if (tree) {
    return split('horizontal', [0.15, 0.28, 0.41, 0.16], [tabs(tree.id), articles, detail, graph])
  }
  return split('horizontal', [0.43, 0.41, 0.16], [articles, detail, graph])
}

const shots = process.env.BRAIAN_ROW226B_SHOTS
  ? resolve(process.env.BRAIAN_ROW226B_SHOTS)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row226b-shots')

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

async function resolveWorkspace(page: Page, workspaceName: string): Promise<Workspace> {
  const listed = (await (await page.request.get('/v1/workspaces')).json()) as {
    workspaces: Array<{ id: string; name: string }>
  }
  const row = listed.workspaces.find((item) => item.name === workspaceName)
  if (!row) throw new Error(`missing ${workspaceName} workspace`)
  const detail = await page.request.get(`/v1/workspaces/${row.id}`)
  if (!detail.ok()) throw new Error(`cannot load ${workspaceName} workspace: ${detail.status()}`)
  const body = (await detail.json()) as { views?: WorkspaceView[] }
  const views = body.views ?? []
  if (views.length === 0) throw new Error(`workspace ${workspaceName} has no views`)
  return { id: row.id, name: row.name, views }
}

async function applyLayout(page: Page, workspace: Workspace, layout: LayoutNode) {
  const me = (await (await page.request.get('/v1/me')).json()) as { user_id?: string; id?: string }
  const userId = me.user_id ?? me.id ?? ''
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
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${workspace.name}`) }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
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
  await expect(pane, `${title} object table pane is in the layout`).toBeVisible({ timeout: 30_000 })
  const filter = pane.getByTestId('quick-filter')
  await expect(filter, `${title} quick-filter is visible before filtering`).toBeVisible({ timeout: 30_000 })
  await filter.fill(key)
  const row = pane.getByTestId('object-row').filter({ hasText: key }).first()
  await expect(row).toBeVisible()
  await row.click()
  if ((await graphCanvas(page).count()) === 0) {
    const graphTab = page.locator('.pane-tab', { hasText: 'Graph' }).first()
    if ((await graphTab.count()) > 0) await graphTab.click()
  }
  await waitGraph(page)
  await page.mouse.move(4, 4)
  await expect(page.getByTestId('graph-inspector')).toBeVisible()
  await expect.poll(async () => (await labelBoxes(page)).length, { timeout: 30_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(700)
}

async function loadNarrowArticles(page: Page) {
  const articles = await resolveWorkspace(page, 'Articles')
  await applyLayout(page, articles, narrowGraphLayout(articles))
  await openGraph(page, 'Articles', ARTICLE.key)
}

async function previewZoom(page: Page) {
  return Number(await graphCanvas(page).getAttribute('data-zoom'))
}

async function zoomOut(page: Page, times = 3) {
  const box = (await graphCanvas(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < times; index += 1) await page.mouse.wheel(0, 300)
  await page.mouse.move(4, 4)
  await waitGraph(page)
  await page.waitForTimeout(400)
}

/**
 * The visible graph frame: the stage minus the legend and the inspector card.
 * A bottom sheet removes height; a side card removes width from the right.
 */
async function visibleFrame(page: Page) {
  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  let frame: Rect = { left: stage.x, top: stage.y, right: stage.x + stage.width, bottom: stage.y + stage.height }
  const legend = page.locator('.graph-legend')
  if ((await legend.count()) > 0) {
    const box = await legend.boundingBox()
    if (box && box.width > 0 && box.height > 0) {
      if (box.y < stage.y + stage.height / 3) frame.top = Math.max(frame.top, box.y + box.height)
      else frame.bottom = Math.min(frame.bottom, box.y)
    }
  }
  const inspector = page.getByTestId('graph-inspector')
  if ((await inspector.count()) > 0) {
    const box = await inspector.boundingBox()
    if (box && box.width > 0 && box.height > 0) {
      if (box.width / stage.width >= 0.6 && box.y > stage.y + stage.height / 3) {
        frame.bottom = Math.min(frame.bottom, box.y)
      } else if (box.x > stage.x + stage.width / 2) {
        frame.right = Math.min(frame.right, box.x)
      }
    }
  }
  return frame
}

type LabelBox = Rect & { id: string; text: string }

async function labelBoxes(page: Page): Promise<LabelBox[]> {
  return page
    .getByTestId('graph-labels')
    .locator('[data-graph-label]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          id: element.getAttribute('data-graph-label') ?? '',
          text: (element.textContent ?? '').trim(),
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
        }
      }),
    )
}

async function expectLabelsInside(page: Page, why: string, frame?: Rect) {
  const visible = frame ?? (await visibleFrame(page))
  const labels = await labelBoxes(page)
  expect(labels.length, `${why}: labels are painted`).toBeGreaterThan(0)
  for (const label of labels) {
    expect(label.left, `${why}: ${label.id} (${label.text}) clipped left`).toBeGreaterThanOrEqual(visible.left - 2)
    expect(label.right, `${why}: ${label.id} (${label.text}) clipped right`).toBeLessThanOrEqual(visible.right + 2)
    expect(label.top, `${why}: ${label.id} (${label.text}) clipped top`).toBeGreaterThanOrEqual(visible.top - 2)
    expect(label.bottom, `${why}: ${label.id} (${label.text}) clipped bottom`).toBeLessThanOrEqual(visible.bottom + 2)
  }
  return { labels, frame: visible }
}

function bbox(labels: LabelBox[]): Rect {
  return {
    left: Math.min(...labels.map((label) => label.left)),
    top: Math.min(...labels.map((label) => label.top)),
    right: Math.max(...labels.map((label) => label.right)),
    bottom: Math.max(...labels.map((label) => label.bottom)),
  }
}

function findLabel(labels: LabelBox[], match: (text: string) => boolean) {
  return labels.find((label) => match(label.text))
}

test('a real reload and leaving full size fit every caption in a 230 px pane with the card open', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await loadNarrowArticles(page)

  const stage = (await page.getByTestId('graph-stage').boundingBox())!
  expect(stage.width, 'the graph pane is about 230 px wide').toBeGreaterThan(200)
  expect(stage.width, 'the graph pane is about 230 px wide').toBeLessThan(270)
  await expect(page.getByTestId('graph-inspector')).toHaveAttribute('data-placement', 'sheet')

  await expectLabelsInside(page, 'first load with the bottom card open')
  await shot(page, 'r2b-step1-load')

  // A real reload, not a component remount.
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await openGraph(page, 'Articles', ARTICLE.key)
  await expect(page.getByTestId('graph-inspector')).toHaveAttribute('data-placement', 'sheet')
  const reloaded = await expectLabelsInside(page, 'after a real F5 reload')
  const food = findLabel(reloaded.labels, (text) => text === 'Food')
  expect(food, 'the Food label is painted').toBeTruthy()
  expect(food!.left, 'Food is not off the left edge after F5').toBeGreaterThanOrEqual(reloaded.frame.left - 2)
  const dark = findLabel(reloaded.labels, (text) => /Dark chocolate/i.test(text))
  expect(dark, 'the long article caption is painted').toBeTruthy()
  expect(dark!.right, 'the long caption is not clipped on the right').toBeLessThanOrEqual(reloaded.frame.right + 2)
  await shot(page, 'r2b-step2-after-f5')

  const paneZoom = await previewZoom(page)
  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  await page.waitForTimeout(700)
  const full = await expectLabelsInside(page, 'full size with an untouched camera')
  expect(full.frame.right - full.frame.left, 'full size has a much larger frame').toBeGreaterThan(stage.width * 2)
  const fullFood = findLabel(full.labels, (text) => text === 'Food')
  expect(fullFood, 'Food is inside full size').toBeTruthy()
  await shot(page, 'r2b-step3-full-size')

  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
  await waitGraph(page)
  await page.waitForTimeout(700)
  await expect(page.getByTestId('graph-inspector')).toHaveAttribute('data-placement', 'sheet')
  const closed = await expectLabelsInside(page, 'after Close full size')
  const closedDark = findLabel(closed.labels, (text) => /Dark chocolate/i.test(text))
  expect(closedDark, 'the long caption returns with the pane fit').toBeTruthy()
  expect(closedDark!.right, 'the long caption is not clipped after Close full size').toBeLessThanOrEqual(
    closed.frame.right + 2,
  )
  expect(await previewZoom(page), 'an untouched camera returns to the pane fitted zoom').toBeCloseTo(paneZoom, 2)
  await shot(page, 'r2b-step4-after-close-full-size')
})

test('a user zoom is remapped into full size instead of being parked in the corner', async ({ page }) => {
  test.setTimeout(300_000)
  await login(page)
  await loadNarrowArticles(page)

  const before = await previewZoom(page)
  await zoomOut(page, 3)
  const userZoom = await previewZoom(page)
  expect(Math.abs(userZoom - before) / before, 'the test moved the camera with a user zoom').toBeGreaterThan(0.02)
  const pane = await expectLabelsInside(page, 'pane after a user zoom')
  const paneFood = findLabel(pane.labels, (text) => text === 'Food')
  expect(paneFood, 'Food is still in the zoomed pane').toBeTruthy()
  await shot(page, 'r2b-step5-user-zoom-pane')

  await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await waitGraph(page)
  await page.waitForTimeout(700)
  expect(await previewZoom(page), 'full size keeps the user zoom').toBeCloseTo(userZoom, 2)
  const full = await expectLabelsInside(page, 'full size after a user zoom')
  const fullFood = findLabel(full.labels, (text) => text === 'Food')
  expect(fullFood, 'Food is not clipped off the top-left of full size').toBeTruthy()
  // Remapping puts the old free-frame centre at the new one, so the content
  // must not be parked against the left/top corner of the larger canvas.
  const content = bbox(full.labels)
  const frameCentreX = (full.frame.left + full.frame.right) / 2
  const frameCentreY = (full.frame.top + full.frame.bottom) / 2
  expect(Math.abs((content.left + content.right) / 2 - frameCentreX), 'content is not parked left').toBeLessThan(
    (full.frame.right - full.frame.left) * 0.25,
  )
  expect(Math.abs((content.top + content.bottom) / 2 - frameCentreY), 'content is not parked top').toBeLessThan(
    (full.frame.bottom - full.frame.top) * 0.25,
  )
  await shot(page, 'r2b-step6-user-zoom-full-size')

  await page.getByRole('button', { name: 'Close full size', exact: true }).click()
  await expect(page.getByTestId('graph-full')).toHaveCount(0)
  await waitGraph(page)
  await page.waitForTimeout(700)
  expect(await previewZoom(page), 'closing full size keeps the user zoom').toBeCloseTo(userZoom, 2)
  await expectLabelsInside(page, 'pane labels after closing full size with a user zoom')
  await shot(page, 'r2b-step7-user-zoom-after-close')
})
