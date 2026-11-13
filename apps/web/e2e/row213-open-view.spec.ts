import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'

// Keep screenshots inside the checkout so CI runners can write them.
const shots = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row213-shots')
mkdirSync(shots, { recursive: true })

const PRODUCTS_TOKEN = 'braian-type-product'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' })).toBeVisible({ timeout: 60_000 })
}

async function resetProductsLayout(page: Page) {
  await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  const body = (await listed.json()) as { workspaces: Array<{ id: string; share_token?: string | null }> }
  const row = body.workspaces.find((item) => item.share_token === PRODUCTS_TOKEN)
  if (!row) throw new Error('missing canonical Products workspace')
  const me = await page.request.get('/v1/me')
  const userId = ((await me.json()) as { user_id?: string }).user_id
  if (userId) {
    await page.evaluate((key) => localStorage.removeItem(key), `braian.layout.${userId}.default.${row.id}`)
  }
  const deleted = await page.request.delete(`/v1/workspaces/${row.id}/state?environment=default`)
  expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
}

async function openPalette(page: Page) {
  const palette = page.getByTestId('command-palette')
  await page.keyboard.press('Control+k')
  await expect(palette).toBeVisible()
  return palette
}

async function openOpenViewSublist(page: Page) {
  const palette = await openPalette(page)
  await palette.getByTestId('palette-input').fill('Open view')
  const root = palette.getByRole('option', { name: /^Open view/ }).first()
  await expect(root).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
  return palette
}

function productPanes(page: Page): Locator {
  return page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }),
  })
}

function treePane(page: Page): Locator {
  return page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="structure_tree"]'),
  })
}

test('Open view focuses an open view in place and Add view stays in the palette', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await resetProductsLayout(page)

  // Put the tree in focus first: a move would steal this pane.
  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
  const treeBefore = await treePane(page).getAttribute('data-views')
  const treePaneId = await treePane(page).getAttribute('data-pane')
  await page.locator('.pane-tab', { hasText: 'Graph' }).first().click()
  await expect(page.getByTestId('graph')).toBeVisible()
  await treePane(page).locator('.pane-tab[data-view-type="structure_tree"]').first().click()
  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
  await expect(productPanes(page)).toHaveCount(1)

  const palette = await openOpenViewSublist(page)
  await palette.getByTestId('palette-input').fill('Products')
  const products = palette.getByRole('option', { name: /^Products/ }).first()
  await expect(products).toBeVisible()
  await page.screenshot({ path: `${shots}/row213-01-open-view-products.png` })
  await products.click()
  await expect(palette).toHaveCount(0)

  // The tree keeps its pane and stays visible; Products is focused in its own pane.
  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
  await expect(treePane(page)).toHaveAttribute('data-views', treeBefore ?? '')
  await expect(treePane(page)).toHaveAttribute('data-pane', treePaneId ?? '')
  await expect(page.getByTestId('graph')).toBeVisible()
  await expect(productPanes(page)).toHaveCount(1)
  await expect(productPanes(page).getByTestId('object-table')).toBeVisible()
  await expect(productPanes(page).getByTestId('object-row').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/row213-02-open-view-in-place.png` })

  // Add view is a root command, found by typing its name, and opens a submenu.
  const addPalette = await openPalette(page)
  await addPalette.getByTestId('palette-input').fill('Add view')
  const addRoot = addPalette.getByRole('option', { name: /^Add view/ }).first()
  await expect(addRoot).toBeVisible()
  await page.screenshot({ path: `${shots}/row213-03-add-view-root.png` })
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Add view ›')
  await expect(addPalette.getByRole('option', { name: /^Products view/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(addPalette).toHaveCount(0)
})

test('Add view → Products view opens a second table and keeps the tree', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await resetProductsLayout(page)

  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
  const treeBefore = await treePane(page).getAttribute('data-views')
  await productPanes(page).getByTestId('object-row').first().click()

  const palette = await openPalette(page)
  await palette.getByTestId('palette-input').fill('Add view')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Add view ›')
  await palette.getByTestId('palette-input').fill('Products view')
  const typeRow = palette.getByRole('option', { name: /^Products view/ }).first()
  await expect(typeRow).toBeVisible()
  await page.screenshot({ path: `${shots}/row213-04-add-view-products-view.png` })
  await typeRow.click()
  await expect(palette).toHaveCount(0)

  const panes = productPanes(page)
  await expect(panes).toHaveCount(2, { timeout: 30_000 })
  for (let index = 0; index < 2; index += 1) {
    await expect(panes.nth(index).getByTestId('object-row').first()).toBeVisible()
  }
  const boxes = await panes.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect()
      return { x: box.x, y: box.y }
    }),
  )
  expect(Math.abs((boxes[0]?.x ?? 0) - (boxes[1]?.x ?? 0))).toBeGreaterThan(40)
  expect(Math.abs((boxes[0]?.y ?? 0) - (boxes[1]?.y ?? 0))).toBeLessThanOrEqual(2)
  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
  await expect(treePane(page)).toHaveAttribute('data-views', treeBefore ?? '')
  await page.screenshot({ path: `${shots}/row213-05-two-products-panes.png` })

  // Cross-pane drag needs both tables showing product rows.
  const left = panes.nth(0)
  const right = panes.nth(1)
  const leftRow = left.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  const rightRow = right.getByTestId('object-row').filter({ hasText: 'PROD-OAT' }).first()
  await expect(leftRow).toBeVisible()
  await expect(rightRow).toBeVisible()
  await dragOver(page, leftRow, rightRow)
  const ghost = page.getByTestId('link-drag-ghost')
  await expect(ghost).toBeVisible()
  await expect(ghost).toContainText(/Link |can't link to/i)
  await page.mouse.up()

  const duplicateTab = right.locator('.pane-tab[data-view-type="object_table"]').first()
  await duplicateTab.hover()
  await duplicateTab.getByRole('button', { name: 'Close tab' }).click()
  await expect(productPanes(page)).toHaveCount(1)
  await expect(productPanes(page).getByTestId('object-row').first()).toBeVisible()
  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
})

test('Open view does not list old agent runs', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await resetProductsLayout(page)

  const title = `agent note ${Date.now().toString().slice(-6)}`
  const palette = await openPalette(page)
  await palette.getByTestId('palette-input').fill(title)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  const tab = page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: title }).last()
  await expect(tab).toBeVisible({ timeout: 30_000 })

  const open = await openOpenViewSublist(page)
  await open.getByTestId('palette-input').fill(title)
  await expect(open.getByRole('option', { name: new RegExp(title) })).toHaveCount(0)
  await open.getByTestId('palette-input').fill('Products')
  await expect(open.getByRole('option', { name: /^Products/ }).first()).toBeVisible()
  await open.getByTestId('palette-input').fill('Graph')
  await expect(open.getByRole('option', { name: /^Graph/ }).first()).toBeVisible()
  await page.screenshot({ path: `${shots}/row213-06-open-view-without-agent.png` })

  // The agent tab and its run are still there; only the destination list hides it.
  await page.keyboard.press('Escape')
  await expect(open).toHaveCount(0)
  await expect(page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: title })).toBeVisible()
})

async function dragOver(page: Page, source: Locator, target: Locator) {
  const start = await visiblePoint(source)
  const end = await visiblePoint(target)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const hop = await source.evaluate((el, origin) => {
    const candidates = [
      { x: origin.x + 24, y: origin.y },
      { x: origin.x - 24, y: origin.y },
      { x: origin.x, y: origin.y + 8 },
    ]
    for (const point of candidates) {
      const hit = document.elementFromPoint(point.x, point.y)
      if (hit && el.contains(hit)) return point
    }
    return { x: origin.x + 24, y: origin.y }
  }, start)
  await page.mouse.move(hop.x, hop.y)
  await page.mouse.move(end.x, end.y)
}

async function visiblePoint(locator: Locator) {
  const point = await locator.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const midX = Math.min(box.left + box.width / 2, window.innerWidth - 2)
    const midY = Math.min(box.top + box.height / 2, window.innerHeight - 2)
    const mid = document.elementFromPoint(midX, midY)
    if (mid && el.contains(mid)) return { x: midX, y: midY }
    const right = Math.min(box.right - 2, window.innerWidth - 2)
    const bottom = Math.min(box.bottom - 2, window.innerHeight - 2)
    for (let y = box.top + 4; y <= bottom; y += 6) {
      for (let x = box.left + 8; x <= right; x += 16) {
        const hit = document.elementFromPoint(x, y)
        if (hit && el.contains(hit)) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('no visible point')
  return point
}
