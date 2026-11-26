import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { focusMainTable, mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  await expect(mainTable(page).getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
}

async function openFieldsPalette(page: Page) {
  await focusMainTable(page)
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('Select fields')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('fields-mode')).toBeVisible()
}

test.describe('row 236 Select fields group paths', () => {
  test('shows type labels with full group paths and finds fields by ancestor names', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await openFieldsPalette(page)

    const caffeine = page.getByTestId('fields-row-caffeine')
    await expect(caffeine).toBeVisible()
    await expect(caffeine).toContainText('Caffeine')
    await expect(caffeine).toContainText('number')
    await expect(caffeine).toContainText('Food › Beverages › Coffee & tea')

    const fat = page.getByTestId('fields-row-fat_content')
    await expect(fat).toContainText('number')
    await expect(fat).toContainText('Food › Dairy & eggs')

    await page.getByTestId('fields-mode-input').fill('snacks')
    await expect(page.getByTestId('fields-row-cocoa_content')).toBeVisible()
    await expect(page.getByTestId('fields-row-caffeine')).toHaveCount(0)
    await expect(page.getByTestId('fields-row-cocoa_content')).toContainText(
      'Food › Snacks & sweets › Chocolate',
    )
  })
})