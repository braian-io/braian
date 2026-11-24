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

  test('rename type in header respects leave dialog and save', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await table.getByTestId('type-key-product').fill('product_row47_tmp')
    await expect(table.getByTestId('review-and-save')).toBeVisible()
    await page.getByRole('button', { name: 'Data model' }).click()
    await page.locator('.pane-tab', { hasText: 'Object types' }).first().click()
    const other = page.getByTestId('object-types-table').locator('[data-row-id="recipe"]')
    await other.click()
    const dialog = page.getByTestId('model-table-leave-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('model-table-leave-discard').click()
    await expect(page.getByTestId('type-key-product')).toHaveValue('product')
    await table.getByTestId('type-key-product').fill('product_row47_saved')
    await table.getByTestId('review-and-save').click()
    await expect(page.getByTestId('review-dialog')).toBeVisible()
    await page.getByTestId('review-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    const defs = (await (await page.request.get('/v1/definitions')).json()) as {
      types: Array<{ key: string }>
    }
    expect(defs.types.some((item) => item.key === 'product_row47_saved')).toBeTruthy()
  })

  test('review workspace switch shows leave dialog', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const brand = table.locator('[data-key="brand"] [data-column="label"]').first()
    await brand.dblclick()
    await page.getByRole('textbox', { name: 'Attribute name' }).fill('Brand draft row47')
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