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

test.describe('fields picker single-hit list', () => {
  test('one search hit keeps row height and does not clip the list', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await openFieldsPalette(page)

    const list = page.getByTestId('fields-mode-list')
    const fat = page.getByTestId('fields-row-fat_content')
    await expect(fat).toBeVisible()

    const fullHeight = (await fat.boundingBox())?.height ?? 0
    expect(fullHeight).toBeGreaterThanOrEqual(44)

    await page.getByTestId('fields-mode-input').fill('fat co')
    await expect(page.getByTestId('fields-row-caffeine')).toHaveCount(0)
    const filtered = page.getByTestId('fields-row-fat_content')
    await expect(filtered).toBeVisible()

    const filteredHeight = (await filtered.boundingBox())?.height ?? 0
    expect(filteredHeight).toBeCloseTo(fullHeight, 0)

    const overflow = await list.evaluate((node) => node.scrollHeight > node.clientHeight + 1)
    expect(overflow).toBe(false)
  })
})