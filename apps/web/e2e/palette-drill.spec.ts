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

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

test.describe('palette drill-in, recent order, and global commands', () => {
  test('Tab on Open view drills in, lists views, and does not ask AI', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)

    await page.getByTestId('palette-input').fill('Open view')
    const command = palette.locator('.hit.on')
    await expect(command).toContainText('Open view')
    await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*open/)
    await expect(palette.locator('.palette-heading', { hasText: 'Best match' })).toBeVisible()
    await expect(palette.getByRole('option', { name: /^Articles view/ })).toHaveCount(0)

    await page.keyboard.press('Tab')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
    const articles = palette.getByRole('option', { name: /Articles view/ }).first()
    await articles.scrollIntoViewIfNeeded()
    await expect(articles).toBeVisible()
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await expect(page.getByTestId('ai-log')).toHaveCount(0)

    await palette.getByRole('option', { name: /Articles view/ }).first().click()
    await expect(palette).toHaveCount(0)
    await expect(page.locator('.pane-tab', { hasText: 'Articles' }).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Enter on Open view drills in, lists views, and does not ask AI', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)

    await page.getByTestId('palette-input').fill('Open view')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*open/)
    await page.keyboard.press('Enter')

    await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
    const articles = palette.getByRole('option', { name: /Articles view/ }).first()
    await articles.scrollIntoViewIfNeeded()
    await expect(articles).toBeVisible()
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await expect(page.getByTestId('ai-log')).toHaveCount(0)

    await page.getByTestId('palette-input').fill('Articles view')
    await expect(palette.locator('.hit.on')).toContainText('Articles view')
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(page.locator('.pane-tab', { hasText: 'Articles' }).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Recent lists the last command first after two runs', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)

    async function run(query: string) {
      const palette = await openPalette(page)
      await page.getByTestId('palette-input').fill(query)
      await expect(palette.locator('.hit.on')).toContainText(query)
      await page.keyboard.press('Enter')
      await expect(palette).toHaveCount(0)
    }

    await run('Reset layout')
    await run('Reset layout')
    await run('Move view left')

    const palette = await openPalette(page)
    const recent = palette.locator('.palette-group').filter({
      has: page.locator('.palette-heading', { hasText: 'Recent' }),
    })
    await expect(recent.getByRole('option').nth(0)).toContainText('Move view left')
    await expect(recent.getByRole('option').nth(1)).toContainText('Reset layout')
    await expect(recent.getByRole('option', { name: /Move view left/ })).toHaveCount(1)
    await expect(recent.getByRole('option', { name: /Reset layout/ })).toHaveCount(1)
  })

  test('shows no product context section while a product is open', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const row = page.getByTestId('object-row').first()
    await row.click({ button: 'right' })
    const menu = page.getByTestId('context-menu')
    await expect(menu.getByRole('menuitem', { name: /Open to the right/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)

    const palette = await openPalette(page)
    await expect(palette.locator('.palette-heading', { hasText: /^On this/ })).toHaveCount(0)
    await expect(palette.locator('.palette-heading', { hasText: 'On selected object' })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: 'Open to the right' })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: /Move to group/ })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: 'Copy id' })).toHaveCount(0)
    await expect(palette.getByText('As it was, and restore')).toHaveCount(0)
    await expect(palette.getByText('Links and where values come from')).toHaveCount(0)
    await expect(palette.getByRole('option', { name: /^Open view/ }).first()).toBeVisible()
  })
})
