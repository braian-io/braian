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

test('a failed cell edit toasts the server message and keeps the previous value', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  await expect(table).toBeVisible()

  const original = 'Mature cheddar'
  const row = table.getByTestId('object-row').filter({ hasText: original }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  const rowId = await row.getAttribute('id')
  expect(rowId).toMatch(/^object-row-/)
  const stableRow = page.locator(`[id="${rowId}"]`)

  await page.route('**/v1/objects/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        code: 'invalid_object',
        detail: 'the write failed validation',
      }),
    })
  })

  const nameCell = stableRow.locator('[data-column="name"]').first()
  await nameCell.dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill('Renamed cheddar')
  await editor.press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)

  // Enter stages the cell; the failed Save keeps the draft and reports the server message.
  await table.getByTestId('review-and-save').click()
  await expect(page.locator('[data-sonner-toast]')).toContainText('the write failed validation')
  await expect(nameCell).toContainText(original)
  await expect(nameCell.getByTestId('cell-diff')).toContainText('Renamed cheddar')
})
