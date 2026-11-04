import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

test.describe('palette sub-lists', () => {
  test('enters a sub-list, searches it, opens an item, and backs out', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = page.getByTestId('command-palette')

    await page.keyboard.press('Control+k')
    await expect(palette).toBeVisible()
    // "Search and open" also matches Open object, and Tab follows the best match.
    await page.getByTestId('palette-input').fill('Open view')
    await expect(palette.getByRole('option', { name: /^Open view/ }).first()).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
    await expect(page.getByTestId('palette-input')).toHaveAttribute('aria-activedescendant', /.+/ )
    const activeId = await page.getByTestId('palette-input').getAttribute('aria-activedescendant')
    await expect(page.locator(`[id="${activeId}"]`)).toHaveCount(1)

    await page.getByTestId('palette-input').fill('Articles')
    const articles = palette.locator('.hit').filter({ hasText: 'Articles view' }).first()
    await expect(articles).toBeVisible()
    await articles.click()
    await expect(palette).toHaveCount(0)
    await expect(page.locator('.pane-tab', { hasText: 'Articles' }).first()).toBeVisible({ timeout: 30_000 })

    await page.keyboard.press('Control+k')
    await page.getByTestId('palette-input').fill('Open workspace')
    await palette.getByRole('option', { name: /^Open workspace/ }).first().click()
    await expect(page.getByTestId('palette-crumb')).toContainText('Open workspace ›')
    await page.keyboard.press('Backspace')
    await expect(page.getByTestId('palette-crumb')).toBeEmpty()
    await expect(palette).toBeVisible()

    await page.getByTestId('palette-input').fill('Open product')
    await palette.getByRole('option', { name: /^Open product/ }).first().press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open product ›')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('palette-crumb')).toBeEmpty()
    await expect(palette).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })
})