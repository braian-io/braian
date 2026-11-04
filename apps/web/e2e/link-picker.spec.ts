import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { paneWithTab, setTheme } from './ui'

// Keyboard link creation: search, choose with the arrows, then the link dialog.
// A product and a supplier have no allowed link type, so that pair only shows
// the invalid dialog. Escape closes both layers and returns focus to Add link.

const shots = process.env.BRAIAN_SHOTS

test.beforeEach(async ({ page }) => {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible()
})

test('arrow keys choose a target and Enter creates the link', async ({ page }) => {
  await open(page, 'ART-CHED-400')
  const add = page.getByTestId('add-link').first()
  await add.focus()
  await page.keyboard.press('Enter')
  const search = page.getByTestId('link-search')
  await expect(search).toBeFocused()
  await search.fill('ART-COFFEE-250')
  const target = page.getByRole('option', { name: /Breakfast filter coffee 250 g/ })
  await expect(target).toBeVisible()
  await expect(target.getByText('Article', { exact: true })).toBeVisible()
  await expect(target.getByText('ART-COFFEE-250', { exact: true })).toBeVisible()
  await choose(page, 'ART-COFFEE-250')
  await shot(page, 'link-picker-dark.png')
  const created = page.waitForResponse(
    (response) => response.url().includes('/v1/links') && response.request().method() === 'POST',
  )
  await page.keyboard.press('Enter')
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: 'Link type' })).toBeVisible()
  await shot(page, 'link-dialog-dark.png')
  await page.getByTestId('link-create-confirm').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-COFFEE-250' })).toBeVisible()
  await expect(add).toBeFocused()
  const body = (await (await created).json()) as { id?: string }
  if (body.id) await page.request.delete(`/v1/links/${body.id}`)
})

test('a pair with no allowed link type explains that in a dialog', async ({ page }) => {
  await open(page, 'PROD-OAT')
  const add = page.getByTestId('add-link').first()
  await add.focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('link-search').fill('SUP-NORTH')
  await expect(page.getByRole('option', { name: /Northmill Foods/ })).toBeVisible()
  await choose(page, 'SUP-NORTH')
  await page.keyboard.press('Enter')
  const invalid = page.getByTestId('link-invalid-dialog')
  await expect(invalid).toBeVisible()
  await expect(invalid).toContainText('This is not a valid link type.')
  await expect(page.getByTestId('link-create-confirm')).toHaveCount(0)
  await shot(page, 'link-invalid-dark.png')
  await page.keyboard.press('Escape')
  await expect(invalid).toBeHidden()
  await expect(add).toBeFocused()
  await expect(page.getByTestId('link-row').filter({ hasText: 'SUP-NORTH' })).toHaveCount(0)
})

test('Escape closes the picker and returns focus to Add link', async ({ page }) => {
  await open(page, 'ART-CHED-200')
  const add = page.getByTestId('add-link').first()
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('link-picker')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-picker')).toBeHidden()
  await expect(add).toBeFocused()
})

test('the light theme shows the same picker and dialog', async ({ page }) => {
  test.skip(!shots, 'screenshots are taken only when BRAIAN_SHOTS is set')
  await setTheme(page, 'light')
  await open(page, 'ART-CHED-400')
  await page.getByTestId('add-link').first().focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('link-search').fill('ART-COFFEE-250')
  await expect(page.getByRole('option', { name: /Breakfast filter coffee 250 g/ })).toBeVisible()
  await choose(page, 'ART-COFFEE-250')
  await shot(page, 'link-picker-light.png')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('link-create-dialog')).toBeVisible()
  await shot(page, 'link-dialog-light.png')
  await page.keyboard.press('Escape')
})

async function open(page: Page, key: string) {
  const title = key.startsWith('PROD-') ? 'Products' : 'Articles'
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${title}`) }).click()
  const pane = paneWithTab(page, title)
  await pane.getByTestId('quick-filter').fill(key)
  const row = pane.getByTestId('object-row').filter({ hasText: key }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect(page.getByTestId('object-detail')).toContainText(key)
  await expect(page.getByTestId('add-link').first()).toBeVisible()
}

async function choose(page: Page, key: string) {
  for (let step = 0; step < 8; step += 1) {
    const selected = page.getByRole('option', { selected: true })
    if ((await selected.count()) === 1 && (await selected.innerText()).includes(key)) return
    await page.keyboard.press('ArrowDown')
  }
  await expect(page.getByRole('option', { selected: true })).toContainText(key)
}

async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, name) })
}
