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

test('object inline create cancels with Escape and Cancel, and only one form opens', async ({ page }) => {
  await login(page)
  const table = mainTable(page)
  await table.getByTestId('table-add-row').click()
  const form = table.getByTestId('new-object')
  await expect(form).toBeVisible()
  await table.getByTestId('new-number').fill('E2E-CANCEL-1')
  await page.keyboard.press('Escape')
  await expect(form).toHaveCount(0)

  await table.getByTestId('table-add-row').click()
  await expect(table.getByTestId('new-object')).toBeVisible()
  await table.getByTestId('new-name').fill('Should not save')
  await table.getByTestId('inline-create-cancel').click()
  await expect(table.getByTestId('new-object')).toHaveCount(0)

  await table.getByTestId('table-add-row').click()
  await table.getByTestId('table-add-row').click()
  await expect(table.getByTestId('new-object')).toHaveCount(1)
})

test('editable table draft create cancels with Escape and Cancel', async ({ page }) => {
  await login(page)
  await page.keyboard.press('Control+K')
  await page.getByTestId('palette-input').fill('Attribute definitions')
  await page.keyboard.press('Enter')
  const view = page.getByTestId('attribute-definitions')
  await expect(view).toBeVisible()

  await view.getByTestId('table-add-row').click()
  await expect(view.getByTestId('inline-create-cancel')).toBeVisible()
  const editor = page.getByTestId('standard-cell-editor')
  await expect(editor).toBeVisible()
  await editor.fill('Draft attribute')
  await editor.press('Escape')
  await expect(editor).toHaveCount(0)
  const draftRow = view.locator('[data-draft="true"]')
  await expect(draftRow).toBeVisible()
  await draftRow.press('Escape')
  await expect(draftRow).toHaveCount(0)
  await expect(view.getByTestId('inline-create-cancel')).toHaveCount(0)

  await view.getByTestId('table-add-row').click()
  await expect(view.locator('[data-draft="true"]')).toHaveCount(1)
  await view.getByTestId('inline-create-cancel').click()
  await expect(view.locator('[data-draft="true"]')).toHaveCount(0)
})
