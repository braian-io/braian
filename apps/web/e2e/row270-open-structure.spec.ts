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
}

test('Open structure from Ctrl+K shows the structure tree', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await resetProductsLayout(page)
  try {
    await expect(page.getByTestId('structure-tree')).toBeVisible()
    await page.locator('.pane-tab[data-view-type="structure_tree"]').first().click()
    await page.keyboard.press('Control+Alt+w')
    await expect(page.getByTestId('structure-tree')).toHaveCount(0)

    await page.keyboard.press('Control+k')
    const palette = page.getByTestId('command-palette')
    await palette.getByTestId('palette-input').fill('open tree')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open structure ›')
    await palette.getByTestId('palette-input').fill('food')
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(page.getByTestId('structure-tree')).toBeVisible({ timeout: 30_000 })
  } finally {
    await resetProductsLayout(page)
  }
})