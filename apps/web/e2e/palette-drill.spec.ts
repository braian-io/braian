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
    await row.click()
    await expect(page.getByTestId('object-detail')).toBeVisible({ timeout: 30_000 })

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

  test('ranks Open view first for ov and open v', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')

    await input.fill('ov')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await expect(palette.locator('.palette-group').filter({
      has: page.locator('.palette-heading', { hasText: 'Best match' }),
    }).getByRole('option').first()).toContainText('Open view')

    await input.fill('open v')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*open/)
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
  })

  test('Backspace leaves a drill-in and Esc closes the palette', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    await page.getByTestId('palette-input').fill('Open view')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
    await page.keyboard.press('Backspace')
    await expect(page.getByTestId('palette-crumb')).toBeEmpty()
    await expect(palette).toBeVisible()
    await page.getByTestId('palette-input').fill('Open product')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open product ›')
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })

  test('Ctrl+J asks and Tab does not', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')
    await input.fill('how many products')
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await expect(palette).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('ai-badge')).toBeVisible()
    await expect(page.getByTestId('ai-question')).toHaveText('how many products')
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })

  test('arrows move the highlight and Home and End stay in the query', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')
    await page.keyboard.press('ArrowDown')
    const first = palette.locator('.hit.on')
    await expect(first).toBeVisible()
    const firstText = (await first.innerText()).trim()
    await page.keyboard.press('ArrowDown')
    await expect(palette.locator('.hit.on')).not.toHaveText(firstText)
    await page.keyboard.press('ArrowUp')
    await expect(palette.locator('.hit.on')).toHaveText(firstText)

    await input.fill('layout')
    await input.press('Home')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0)
    await input.press('End')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe('layout'.length)
    await expect(input).toHaveValue('layout')
    await expect(palette).toBeVisible()
  })
})
