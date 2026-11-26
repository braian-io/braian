import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openTypeAttributes(page: Page, typeKey: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator(`[data-row-id="${typeKey}"]`)
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  await expect(page.getByTestId('attribute-table')).toBeVisible()
  return page.getByTestId('attribute-table')
}

test.describe('row 47 type header draft and leave guard', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('Object types pane tab shows leave dialog and Cancel keeps the draft', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const typeKey = page.getByTestId('type-key-product')
    await typeKey.fill('product_row47_leave')
    await expect(table.getByTestId('review-and-save')).toBeVisible()
    const objectTypesTab = page.locator('.pane-tab', { hasText: 'Object types' }).first().locator('.pane-tab-open')
    await expect(objectTypesTab).toBeVisible()
    await objectTypesTab.click()
    const dialog = page.getByTestId('model-table-leave-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(typeKey).toHaveValue('product_row47_leave')
    await expect(table.getByTestId('review-and-save')).toBeVisible()
    await expect(page.getByTestId('attribute-table')).toBeVisible()
  })

  test('review workspace switch shows leave dialog', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const brand = table.locator('[data-key="brand"] [data-column="label"]').first()
    await brand.dblclick()
    await page.getByRole('textbox', { name: 'Name' }).fill('Brand draft row47')
    await page.keyboard.press('Enter')
    await expect(table.getByTestId('review-and-save')).toBeVisible()
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('braian-open-proposal', { detail: { proposalId: 'unused' } }))
    })
    const dialog = page.getByTestId('model-table-leave-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})