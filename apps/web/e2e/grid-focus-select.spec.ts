import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

function objectParam(page: Page) {
  return new URL(page.url()).searchParams.get('object')
}

test('grid focus moves without selecting; Enter and Space select; Left/Right move the column', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  // No row is selected on a fresh workspace; Detail shows its empty state.
  await expect(page.getByTestId('detail-empty')).toBeVisible()

  const grid = table.locator('.grid').first()
  const first = rows.first()
  const second = rows.nth(1)
  const firstRowId = await first.getAttribute('id')
  const secondRowId = await second.getAttribute('id')
  expect(firstRowId).toBeTruthy()
  expect(secondRowId).toBeTruthy()

  // Focusing/Tabbing into the grid must not select or open the first row.
  await grid.focus()
  expect(await grid.evaluate((element) => element.matches(':focus'))).toBe(true)
  await expect(page.getByTestId('detail-empty')).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(grid).toHaveAttribute('aria-activedescendant', firstRowId!)
  await expect(first).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByTestId('detail-empty')).toBeVisible()
  await expect.poll(() => objectParam(page)).toBeNull()

  // Enter commits the focused row as the selection and Detail follows.
  await page.keyboard.press('Enter')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-empty')).toHaveCount(0)
  await expect(page.getByTestId('object-detail')).toBeVisible()
  const firstObjectId = firstRowId!.replace(/^object-row-/, '')
  const firstKey = (await first.locator('[data-column="key"]').innerText()).trim()
  expect(firstKey).not.toBe('')
  expect(firstKey).not.toBe(firstObjectId)
  await expect.poll(() => objectParam(page)).toBe(firstKey)

  // Arrow moves focus only; the selected row and Detail stay put.
  await page.keyboard.press('ArrowDown')
  await expect(grid).toHaveAttribute('aria-activedescendant', secondRowId!)
  await expect(second).toHaveAttribute('aria-selected', 'false')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => objectParam(page)).toBe(firstObjectId)

  // Space selects the newly focused row, same as Enter.
  await page.keyboard.press('Space')
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(first).toHaveAttribute('aria-selected', 'false')
  const secondObjectId = secondRowId!.replace(/^object-row-/, '')
  const secondKey = (await second.locator('[data-column="key"]').innerText()).trim()
  expect(secondKey).not.toBe(secondObjectId)
  await expect.poll(() => objectParam(page)).toBe(secondKey)

  // Left/Right still move the active cell on the focused row.
  const activeCell = second.locator('.cell.active-cell')
  await expect(activeCell).toHaveCount(1)
  const before = await activeCell.getAttribute('data-column')
  expect(before).toBeTruthy()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => second.locator('.cell.active-cell').getAttribute('data-column')).not.toBe(before)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => second.locator('.cell.active-cell').getAttribute('data-column')).toBe(before)
})
