import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCTS_TOKEN = 'braian-type-product'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
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
  return row.id
}

async function openFoodStructure(page: Page, modifiers: { ctrl?: boolean } = {}) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await palette.getByTestId('palette-input').fill('open tree')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Open structure ›')
  await palette.getByTestId('palette-input').fill('food')
  if (modifiers.ctrl) {
    await page.keyboard.press('Control+Enter')
  } else {
    await page.keyboard.press('Enter')
  }
  await expect(palette).toHaveCount(0)
}

async function structureTreeViewCount(page: Page, workspaceId: string) {
  const views = await page.request.get(`/v1/workspaces/${workspaceId}`)
  const body = (await views.json()) as { views?: Array<{ type: string; state?: Record<string, unknown> }> }
  return (body.views ?? []).filter(
    (view) => view.type === 'structure_tree' && String(view.state?.structure_key ?? '') === 'food',
  ).length
}

test('Open structure from Ctrl+K shows the structure tree', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const workspaceId = await resetProductsLayout(page)
  try {
    await expect(page.getByTestId('structure-tree')).toBeVisible()
    await page.locator('.pane-tab[data-view-type="structure_tree"]').first().click()
    await page.keyboard.press('Control+Alt+w')
    await expect(page.getByTestId('structure-tree')).toHaveCount(0)

    await openFoodStructure(page)
    await expect(page.getByTestId('structure-tree')).toBeVisible({ timeout: 30_000 })
    expect(await structureTreeViewCount(page, workspaceId)).toBe(1)
  } finally {
    await resetProductsLayout(page)
  }
})

test('Ctrl+Enter opens the structure tree to the right without duplicating views', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const workspaceId = await resetProductsLayout(page)
  try {
    const products = page.getByTestId('object-table').first()
    await expect(products).toBeVisible()
    await page.locator('[data-view-type="object_detail"]').first().click()

    await openFoodStructure(page, { ctrl: true })
    const trees = page.getByTestId('structure-tree')
    await expect(trees).toHaveCount(1, { timeout: 30_000 })
    expect(await structureTreeViewCount(page, workspaceId)).toBe(1)

    await openFoodStructure(page, { ctrl: true })
    await expect(page.getByTestId('structure-tree')).toHaveCount(1)
    expect(await structureTreeViewCount(page, workspaceId)).toBe(1)

    await expect(products).toBeVisible()
    await expect(page.locator('[data-view-type="object_detail"]').first()).toBeVisible()
  } finally {
    await resetProductsLayout(page)
  }
})

test('opening Food links Products to the tree', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await resetProductsLayout(page)
  try {
    await openFoodStructure(page)
    await expect(page.getByTestId('structure-tree')).toBeVisible({ timeout: 30_000 })
    const products = page.locator('[data-pane]').filter({ has: page.getByTestId('object-table') }).first()
    await expect(products.getByTestId('view-source-label')).toContainText('Food', { timeout: 30_000 })
  } finally {
    await resetProductsLayout(page)
  }
})