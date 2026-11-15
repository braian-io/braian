import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function deleteShareToken(page: Page, token: string) {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  const body = (await listed.json()) as {
    workspaces: Array<{ id: string; share_token?: string | null; name: string }>
  }
  const row = body.workspaces.find((item) => item.share_token === token)
  if (!row) return
  const deleted = await page.request.delete(`/v1/workspaces/${row.id}`)
  expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
}

test('workspace tab bar shows a New workspace button after the last tab (K1)', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page)
  const tabs = page.locator('nav.tabs')
  const workspaceTabs = tabs.locator('button.tab:not(.tab-new)')
  await expect(workspaceTabs.first()).toBeVisible()
  const add = tabs.getByTestId('workspace-new-button')
  await expect(add).toBeVisible()
  await expect(add).toHaveAttribute('aria-label', 'New workspace')
  await expect(add).toHaveAttribute('title', 'New workspace')
  const tabCount = await workspaceTabs.count()
  const addIndex = await add.evaluate((el) => {
    const parent = el.parentElement
    if (!parent) return -1
    return Array.from(parent.children).indexOf(el)
  })
  expect(addIndex).toBe(tabCount)
})

test('New workspace button opens the template chooser (K3)', async ({ page }) => {
  test.setTimeout(60_000)
  await login(page)
  await page.getByTestId('workspace-new-button').click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await expect(palette.locator('.crumb')).toContainText('New from template')
  await expect(palette.getByRole('option', { name: /^Review/ })).toBeVisible()
  await expect(palette.getByRole('option', { name: /^Data model/ })).toBeVisible()
})

test('creating a workspace via the + button adds an active tab (K5)', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await deleteShareToken(page, 'braian-review')
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('nav.tabs button.tab', { hasText: 'Review' })).toHaveCount(0)

  await page.getByTestId('workspace-new-button').click()
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('Review')
  await expect(palette.getByRole('option', { name: /^Review/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)

  const reviewTab = page.locator('nav.tabs button.tab', { hasText: 'Review' })
  await expect(reviewTab).toBeVisible({ timeout: 30_000 })
  await expect(reviewTab).toHaveClass(/active/)
})