import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'

// K3: Add view -> Products view always clones into a new pane on the right.
// This spec starts from the non-empty demo-like layout and adds a closed
// Products object-table view first, so reopening cannot pass by accident.
const shots = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row213b-shots')
mkdirSync(shots, { recursive: true })

const PRODUCTS_TOKEN = 'braian-type-product'

type ViewRow = { id: string; type: string; title: string; state?: Record<string, unknown> }
type WorkspaceDetail = { id: string; views: ViewRow[] }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }).first()).toBeVisible({ timeout: 60_000 })
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

async function productsWorkspace(page: Page): Promise<WorkspaceDetail> {
  const listed = await page.request.get('/v1/workspaces')
  const body = (await listed.json()) as { workspaces: Array<{ id: string; share_token?: string | null }> }
  const row = body.workspaces.find((item) => item.share_token === PRODUCTS_TOKEN)
  if (!row) throw new Error('missing canonical Products workspace')
  const full = await page.request.get(`/v1/workspaces/${row.id}`)
  return (await full.json()) as WorkspaceDetail
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

function paneWithTab(page: Page, id: string): Locator {
  return page.locator('section.pane').filter({ has: page.locator(`[data-tab="${id}"]`) })
}

async function openProductTabIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.pane-tab[data-view-type="object_table"]'))
      .filter((node) => (node.textContent ?? '').includes('Products'))
      .map((node) => node.getAttribute('data-tab') ?? '')
      .filter(Boolean),
  )
}

async function closeTab(page: Page, id: string) {
  await page.getByTestId(`close-tab-${id}`).click()
  await expect(page.locator(`[data-tab="${id}"]`)).toHaveCount(0)
}

async function addProductsView(page: Page) {
  const palette = page.getByTestId('command-palette')
  await page.keyboard.press('Control+k')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('Add view')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Add view ›')
  await palette.getByTestId('palette-input').fill('Products view')
  const typeRow = palette.getByRole('option', { name: /^Products view/ }).first()
  await expect(typeRow).toBeVisible()
  await typeRow.click()
  await expect(palette).toHaveCount(0)
}

test('Add view clones Products into a new pane right of the open table despite a closed copy', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await resetProductsLayout(page)

  const [originalId] = await openProductTabIds(page)
  if (!originalId) throw new Error('missing open Products table')
  await expect(treePane(page).getByTestId('structure-tree')).toBeVisible()
  await expect(productPanes(page)).toHaveCount(1)

  // Create a second Products table, close it, and leave the view in the catalog.
  await addProductsView(page)
  await expect(productPanes(page)).toHaveCount(2, { timeout: 30_000 })
  const cloneId = (await openProductTabIds(page)).find((id) => id !== originalId)
  if (!cloneId) throw new Error('missing cloned Products table')
  await page.screenshot({ path: `${shots}/row213b-01-clone-open.png` })
  await closeTab(page, cloneId)
  await expect(productPanes(page)).toHaveCount(1)
  const closed = (await productsWorkspace(page)).views.find((view) => view.id === cloneId)
  expect(closed, 'closing a tab must keep the view in the catalog').toBeTruthy()
  await page.screenshot({ path: `${shots}/row213b-02-clone-closed.png` })

  // Focus the tree first: Add view must still split beside the open Products table.
  const tree = treePane(page)
  await tree.locator('.pane-tab[data-view-type="structure_tree"]').first().click()
  const treeViews = await tree.getAttribute('data-views')
  const treePaneId = await tree.getAttribute('data-pane')
  const graphPane = page.locator('section.pane').filter({ has: page.locator('.pane-tab', { hasText: 'Graph' }) })
  await expect(graphPane.locator('.pane-tab', { hasText: 'Graph' })).toHaveCount(1)
  const graphViews = await graphPane.getAttribute('data-views')

  await addProductsView(page)
  const panes = productPanes(page)
  await expect(panes).toHaveCount(2, { timeout: 30_000 })

  const openIds = await openProductTabIds(page)
  const newId = openIds.find((id) => id !== originalId)
  if (!newId) throw new Error('missing new Products table')
  expect(newId, 'must not reopen the closed copy').not.toBe(cloneId)
  expect(openIds, 'the closed view stays closed').not.toContain(cloneId)

  const originalPane = paneWithTab(page, originalId)
  const newPane = paneWithTab(page, newId)
  await expect(originalPane).toHaveCount(1)
  await expect(newPane).toHaveCount(1)
  await expect(originalPane).not.toHaveAttribute('data-pane', newId)
  await expect(newPane).not.toHaveAttribute('data-pane', originalId)
  await expect(originalPane.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' })).toHaveCount(1)
  await expect(newPane.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' })).toHaveCount(1)

  await expect(tree.getByTestId('structure-tree')).toBeVisible()
  await expect(tree).toHaveAttribute('data-views', treeViews ?? '')
  await expect(tree).toHaveAttribute('data-pane', treePaneId ?? '')
  await expect(tree.locator(`[data-tab="${newId}"]`)).toHaveCount(0)
  await expect(graphPane.locator('.pane-tab', { hasText: 'Graph' })).toHaveCount(1)
  await expect(graphPane).toHaveAttribute('data-views', graphViews ?? '')
  await expect(newPane.locator('.pane-tab', { hasText: 'Graph' })).toHaveCount(0)
  await expect(newPane.locator('.pane-tab', { hasText: 'Detail' })).toHaveCount(0)

  const boxes = await Promise.all([originalPane.boundingBox(), newPane.boundingBox()])
  if (!boxes[0] || !boxes[1]) throw new Error('missing pane boxes')
  expect(boxes[1].x, 'new pane is to the right of the open Products table').toBeGreaterThan(boxes[0].x + 40)
  expect(Math.abs(boxes[1].y - boxes[0].y)).toBeLessThanOrEqual(2)
  await page.screenshot({ path: `${shots}/row213b-03-new-pane-right.png` })

  await closeTab(page, newId)
  await expect(productPanes(page)).toHaveCount(1)
  await expect(productPanes(page).getByTestId('object-row').first()).toBeVisible()
  await expect(tree.getByTestId('structure-tree')).toBeVisible()
  await page.screenshot({ path: `${shots}/row213b-04-copy-closed-again.png` })
})

test('Add view with no open Products table creates a new view instead of reopening the closed one', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await resetProductsLayout(page)

  const [originalId] = await openProductTabIds(page)
  if (!originalId) throw new Error('missing open Products table')
  const closedIds = new Set<string>()
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const open = await openProductTabIds(page)
    if (open.length === 0) break
    for (const id of open) {
      closedIds.add(id)
      await closeTab(page, id)
    }
  }
  await expect(productPanes(page)).toHaveCount(0)
  const closedBefore = await productsWorkspace(page)
  expect(closedBefore.views.some((view) => view.id === originalId)).toBeTruthy()
  expect(closedIds.size).toBeGreaterThan(0)

  const tree = treePane(page)
  await tree.locator('.pane-tab[data-view-type="structure_tree"]').first().click()
  const treeViews = await tree.getAttribute('data-views')
  const treeBox = await tree.boundingBox()
  await page.screenshot({ path: `${shots}/row213b-05-no-open-products.png` })

  await addProductsView(page)
  await expect(productPanes(page)).toHaveCount(1, { timeout: 30_000 })
  const [newId] = await openProductTabIds(page)
  if (!newId) throw new Error('missing new Products table')
  expect(closedIds.has(newId), 'must not reopen a closed view').toBe(false)
  expect(newId).not.toBe(originalId)
  expect((await productsWorkspace(page)).views.some((view) => view.id === originalId)).toBeTruthy()

  await expect(tree.getByTestId('structure-tree')).toBeVisible()
  await expect(tree).toHaveAttribute('data-views', treeViews ?? '')
  const newPane = paneWithTab(page, newId)
  await expect(newPane.getByTestId('object-row').first()).toBeVisible()
  const newBox = await newPane.boundingBox()
  if (!treeBox || !newBox) throw new Error('missing pane boxes')
  expect(newBox.x, 'new pane is to the right of the focused tree').toBeGreaterThan(treeBox.x + 40)
  expect(Math.abs(newBox.y - treeBox.y)).toBeLessThanOrEqual(2)
  await page.screenshot({ path: `${shots}/row213b-06-new-pane-without-open-table.png` })

  await closeTab(page, newId)
  await resetProductsLayout(page)
})
