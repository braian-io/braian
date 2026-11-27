import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, waitDetailReady } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
}

function products(page: Page) {
  return mainTable(page)
}

function rows(page: Page) {
  return products(page).getByTestId('object-row')
}

function grid(page: Page) {
  return products(page).locator('.grid').first()
}

async function openProducts(page: Page) {
  await login(page)
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 })
  return products(page)
}

async function rowTotal(table: Locator) {
  const text = await table.getByTestId('row-count').innerText()
  const total = Number(text.replace(/[^\d]/g, ''))
  expect(total).toBeGreaterThan(1)
  return total
}

test('shift range, ctrl toggle, checkbox, action bar, and detail hint', async ({ page }) => {
  test.setTimeout(120_000)
  const table = await openProducts(page)
  const list = rows(page)

  const firstBox = list.first().getByTestId('row-checkbox')
  await expect.poll(async () => firstBox.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await list.first().hover()
  await expect.poll(async () => firstBox.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')

  await list.nth(0).click()
  await list.nth(2).click({ modifiers: ['Shift'] })
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(2)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(3)).toHaveAttribute('aria-selected', 'false')
  const thirdName = (await list.nth(2).locator('[data-column="name"]').innerText()).trim()
  await waitDetailReady(page)
  await expect(page.getByTestId('object-detail').locator('.detail-title strong')).toHaveText(thirdName)
  await expect(page.getByTestId('detail-selection-hint')).toHaveText('3 selected')
  await expect(table.getByTestId('table-selection-count')).toHaveText('3 selected')

  await list.nth(1).click({ modifiers: ['Control'] })
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'false')
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(2)).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-selection-hint')).toHaveText('2 selected')
  await expect.poll(async () => list.nth(3).getByTestId('row-checkbox').evaluate((element) => getComputedStyle(element).opacity)).toBe('1')

  await list.nth(0).click()
  await list.nth(3).getByTestId('row-checkbox').click()
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(3)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'false')
  await expect(table.getByTestId('table-selection-count')).toHaveText('2 selected')

  await list.nth(4).getByTestId('row-checkbox').click({ modifiers: ['Shift'] })
  for (const index of [0, 1, 2, 3, 4]) {
    await expect(list.nth(index)).toHaveAttribute('aria-selected', 'true')
  }
  await expect(table.getByTestId('table-selection-count')).toHaveText('5 selected')
  const rangedName = (await list.nth(4).locator('[data-column="name"]').innerText()).trim()

  await table.getByTestId('table-selection-clear').click()
  await expect(table.getByTestId('table-selection-bar')).toHaveCount(0)
  await expect(page.getByTestId('detail-selection-hint')).toHaveCount(0)
  await expect(page.getByTestId('object-detail').locator('.detail-title strong')).toHaveText(rangedName)
  await expect(table.locator('[data-testid="object-row"][aria-selected="true"]')).toHaveCount(0)

  await list.nth(0).click()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await expect(table.getByTestId('table-selection-bar')).toBeVisible()
  await list.nth(2).click()
  await expect(table.getByTestId('table-selection-bar')).toHaveCount(0)
  await expect(list.nth(2)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'false')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'false')
})

test('context menu keeps the selection and delete confirms every selected row', async ({ page }) => {
  test.setTimeout(120_000)
  await openProducts(page)
  const list = rows(page)

  await list.nth(0).click()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await list.nth(1).click({ button: 'right' })
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('menuitem', { name: 'Delete…' }).click()
  await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
  await expect(page.getByTestId('delete-object-counts')).toContainText('2 objects')
  await page.getByTestId('cancel-delete-object').click()
  await expect(page.getByTestId('delete-object-dialog')).toHaveCount(0)
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'true')

  await list.nth(3).click({ button: 'right' })
  await expect(list.nth(3)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'false')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'false')
  await page.keyboard.press('Escape')
})

test('Ctrl+A selects loaded rows, then Select all matching selects the filter total', async ({ page }) => {
  test.setTimeout(120_000)
  const table = await openProducts(page)
  const total = await rowTotal(table)
  await rows(page).first().click()
  await grid(page).focus()
  await page.keyboard.press('Control+a')
  const banner = table.getByTestId('select-all-matching')
  await expect(banner).toHaveText(`Select all ${total} matching`)
  await banner.click()
  await expect(banner).toHaveCount(0, { timeout: 30_000 })
  await expect(table.getByTestId('table-selection-count')).toHaveText(`${total} selected`)
})

test('selection clears when the search changes and when the tree node changes', async ({ page }) => {
  test.setTimeout(120_000)
  const table = await openProducts(page)
  const list = rows(page)

  await list.nth(0).click()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await expect(table.getByTestId('table-selection-bar')).toBeVisible()
  await table.getByTestId('quick-filter').fill('zzz-no-match')
  await expect(table.getByTestId('table-selection-bar')).toHaveCount(0)
  await expect(table.locator('[data-testid="object-row"][aria-selected="true"]')).toHaveCount(0)

  await table.getByTestId('quick-filter').fill('')
  await expect(list.first()).toBeVisible({ timeout: 60_000 })
  await list.nth(0).click()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await expect(table.getByTestId('table-selection-bar')).toBeVisible()

  const milk = page.getByRole('treeitem').filter({ hasText: /^Milk\b/ }).first()
  const cheese = page.getByRole('treeitem').filter({ hasText: /^Cheese\b/ }).first()
  await expect(milk).toBeVisible()
  const next = (await milk.getAttribute('aria-selected')) === 'true' ? cheese : milk
  await next.click()
  await expect(table.getByTestId('table-selection-bar')).toHaveCount(0)
  await expect(table.locator('[data-testid="object-row"][aria-selected="true"]')).toHaveCount(0)
})
