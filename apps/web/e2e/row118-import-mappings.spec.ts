import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const csv = {
  name: 'row118-items.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('number,name\nR118-1,Lamp\n'),
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openImport(page: Page) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('Import file')
  await page.getByTestId('command-palette').locator('[data-value="import:file"]').click()
  await expect(page.getByTestId('import-screen')).toBeVisible()
  await page.getByTestId('import-file').setInputFiles(csv)
  await expect(page.getByTestId('import-mapping')).toBeVisible({ timeout: 60_000 })
  const type = page.getByTestId('import-type')
  if ((await type.inputValue()) === '') await type.selectOption('product')
  await expect(page.getByTestId('import-save-mapping')).toBeEnabled()
}

async function closeImport(page: Page) {
  await page.getByTestId('import-screen').getByRole('button', { name: 'Close' }).click()
  const confirm = page.getByTestId('import-confirm')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByTestId('import-screen')).toHaveCount(0)
}

test('saved import mappings can be listed, renamed, reapplied and deleted', async ({ page }) => {
  test.setTimeout(120_000)
  const name = `Row 118 ${Date.now().toString().slice(-6)}`
  const renamed = `${name} renamed`
  await login(page)
  await openImport(page)

  await page.getByTestId('import-save-mapping').click()
  const dialog = page.getByTestId('import-save-mapping-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('import-save-mapping-name').fill(name)
  await dialog.getByTestId('import-save-mapping-submit').click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('import-mapping-saved')).toHaveText(`Saved as ${name}.`)
  await expect(page.getByTestId('import-saved-mapping-status')).toHaveText(`Using saved mapping ${name}.`)
  await expect(page.getByTestId('import-saved-mapping').locator('option:checked')).toHaveText(name)

  await closeImport(page)
  await page.keyboard.press('Control+k')
  await page.getByTestId('palette-input').fill('Import mappings')
  await page.getByTestId('command-palette').locator('[data-value="import:mappings"]').click()
  const table = page.getByTestId('import-mappings')
  await expect(table).toBeVisible()
  await expect(table).toContainText('Source')
  await expect(table).toContainText('Created by')
  await expect(table).toContainText('Updated')
  const row = table.locator('.standard-grid-row').filter({ hasText: name })
  await expect(row).toBeVisible()
  await row.locator('[data-column="name"]').dblclick()
  const editor = page.getByTestId('standard-cell-editor')
  await expect(editor).toBeVisible()
  await editor.fill(renamed)
  const patch = page.waitForResponse(
    (response) => response.url().includes('/v1/import-mappings/') && response.request().method() === 'PATCH',
  )
  await editor.press('Enter')
  expect((await patch).ok()).toBeTruthy()
  await expect(row.locator('[data-column="name"]')).toContainText(renamed)

  await openImport(page)
  await expect(page.getByTestId('import-saved-mapping-status')).toHaveText(`Using saved mapping ${renamed}.`)
  await expect(page.getByTestId('import-saved-mapping').locator('option:checked')).toHaveText(renamed)
  const applied = page.waitForResponse(
    (response) => response.url().includes('/saved-mapping') && response.request().method() === 'POST',
  )
  await page.getByTestId('import-saved-mapping').selectOption('')
  const response = await applied
  expect(response.ok()).toBeTruthy()
  expect(response.request().postDataJSON()).toEqual({ mapping_id: null })
  await expect(page.getByTestId('import-saved-mapping-status')).toHaveText('Manual mapping.')
  await expect(page.getByTestId('import-saved-mapping')).toHaveValue('')

  await closeImport(page)
  await page.locator('.pane-tab').filter({ hasText: 'Import mappings' }).first().click()
  const again = table.locator('.standard-grid-row').filter({ hasText: renamed })
  await expect(again).toBeVisible()
  await again.getByRole('button', { name: `Delete ${renamed}` }).click()
  const confirm = page.getByTestId('import-mapping-delete')
  await expect(confirm).toBeVisible()
  await expect(confirm.locator('input')).toHaveCount(0)
  await confirm.getByTestId('confirm-delete-mapping').click()
  await expect(confirm).toBeHidden()
  await expect(table.locator('.standard-grid-row').filter({ hasText: renamed })).toHaveCount(0)
})
