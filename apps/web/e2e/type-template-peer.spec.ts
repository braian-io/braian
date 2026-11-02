import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
}

async function deleteShareToken(page: Page, token: string) {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  const body = (await listed.json()) as {
    workspaces: Array<{ id: string; share_token?: string | null }>
  }
  const row = body.workspaces.find((item) => item.share_token === token)
  if (!row) return
  const deleted = await page.request.delete(`/v1/workspaces/${row.id}`)
  expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
}

test('type template adds a peer table that follows the selected main row', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)

  // Remove the seeded Products workspace so the template creates a fresh one.
  await deleteShareToken(page, 'braian-type-product')
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })

  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New from template')
  await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.locator('.crumb')).toContainText('New from template')
  await palette.getByTestId('palette-input').fill('Products')
  await expect(palette.getByRole('option', { name: /^Products/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)

  const productsTab = page.locator('nav.tabs button.tab', { hasText: 'Products' })
  await expect(productsTab).toBeVisible({ timeout: 30_000 })
  await productsTab.click()

  const mainPane = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }),
  })
  const peerPane = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Articles' }),
  })
  await expect(mainPane.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })
  await expect(peerPane.getByTestId('object-table').first()).toBeVisible({ timeout: 60_000 })

  const firstRow = mainPane.getByTestId('object-row').first()
  await firstRow.click()
  await expect(firstRow).toHaveAttribute('aria-selected', 'true')

  await expect(peerPane.getByTestId('view-source-label')).toContainText('Products', {
    timeout: 30_000,
  })
  await expect(peerPane.getByTestId('object-row').first()).toBeVisible({ timeout: 30_000 })
})
