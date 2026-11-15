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

async function enterOn(page: Page, rowTestId: string) {
  await expect(page.getByTestId(rowTestId)).toBeVisible()
  for (let i = 0; i < 120; i += 1) {
    const active = page.locator('[data-testid="fields-mode"] [data-active="true"]')
    const activeId = await active.getAttribute('data-testid')
    if (activeId === rowTestId) {
      await page.keyboard.press('Enter')
      return
    }
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`Could not move active highlight to ${rowTestId}`)
}

function cheddarRow(page: Page) {
  return mainTable(page).getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
}

test.describe('row 237 unit display and Select fields', () => {
  test('converted measures are rounded and unit headers keep casing', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Energy')
    await enterOn(page, 'fields-row-energy')
    await enterOn(page, 'fields-row-kcal')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('fields-mode')).toHaveCount(0)

    const headerKcal = mainTable(page).locator('.head [data-testid^="col-energy"]').first()
    await expect(headerKcal).toBeVisible()
    await expect(headerKcal).toContainText('Energy')
    await expect(headerKcal).toContainText('kcal')

    const cell = cheddarRow(page).locator('[data-testid^="path-cell-energy"]')
    await expect(cell).toBeVisible()
    const text = ((await cell.textContent()) ?? '').trim()
    expect(text).toMatch(/^\d{1,3}(,\d{3})*(\.\d{1,2})? kcal$/)
    expect(text).not.toMatch(/\d+\.\d{3,}/)

    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Energy')
    await enterOn(page, 'fields-row-energy')
    await enterOn(page, 'fields-row-kJ')
    await page.keyboard.press('Escape')

    const headerKj = mainTable(page).locator('.head [data-testid*="unit:kJ"], .head [data-testid*="unit:kj"]').first()
    await expect(headerKj).toBeVisible()
    await expect(headerKj).toContainText('Energy (kJ)')
    await expect(headerKj).not.toContainText('(kj)')
  })

  test('Enter with an empty Select fields filter does not toggle columns', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(mainTable(page).locator('.head [data-testid="col-number"]').first()).toBeVisible()
    await openFieldsPalette(page)
    await expect(page.getByTestId('fields-check-number')).toHaveAttribute('data-state', 'checked')
    await page.getByTestId('fields-mode-input').fill('')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('fields-check-number')).toHaveAttribute('data-state', 'checked')
    await page.keyboard.press('Escape')
    await expect(mainTable(page).locator('.head [data-testid="col-number"]').first()).toBeVisible()
  })

  test('Enter still toggles when the filter matches a field', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('brand')
    await enterOn(page, 'fields-row-brand')
    await page.keyboard.press('Escape')
    await expect(mainTable(page).locator('.head [data-testid="col-brand"]').first()).toBeVisible()
  })
})