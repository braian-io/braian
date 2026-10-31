import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('user-menu')).toBeVisible()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

test('status bar shows Reload when /version.json advertises a newer build', async ({ page }) => {
  const newer = 'e2e-newer-build-113'
  await page.route('**/version.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ buildId: newer }),
      headers: { 'cache-control': 'no-store' },
    })
  })

  await login(page)

  const bar = page.getByTestId('status-bar')
  await expect(bar).toHaveAttribute('data-kind', 'update', { timeout: 20_000 })
  await expect(bar).toContainText('A new version is available')
  const action = page.getByTestId('status-bar-action')
  await expect(action).toHaveText('Reload')

  // Ctrl+K command appears only while the gate is open.
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('reload to new')
  await expect(
    page.getByTestId('command-palette').locator('.hit', { hasText: 'Reload to new version' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), action.click()])
  // After reload the mock still advertises a newer build, so the notice returns.
  await expect(page.getByTestId('status-bar')).toHaveAttribute('data-kind', 'update', { timeout: 20_000 })
})
