import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, waitDetailReady } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProductAttributes(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator('[data-row-id="product"]')
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

type Definitions = {
  attributes?: Array<{ key?: string; description?: string }>
}

async function brandDescription(page: Page) {
  const body = (await (await page.request.get('/v1/definitions')).json()) as Definitions
  return body.attributes?.find((item) => item.key === 'brand')?.description ?? ''
}

async function stageAndSave(page: Page, steps: Array<Record<string, unknown>>) {
  const staged = await page.request.post('/v1/model/draft/steps', { data: { steps } })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
}

async function editBrandDescription(row: Locator, value: string) {
  const descCell = row.locator('[data-column="description"]')
  await descCell.scrollIntoViewIfNeeded()
  await descCell.dblclick()
  const editor = row.getByTestId('attr-desc-brand')
  await expect(editor).toBeVisible()
  await editor.fill(value)
  await editor.press('Enter')
}

async function openProductDetail(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  const filter = mainTable(page).getByTestId('quick-filter').first()
  if ((await filter.inputValue()) !== '') await filter.fill('')
  const row = mainTable(page).getByTestId('object-row').first()
  await expect(row).toBeVisible()
  await row.click()
  const detailTab = page.locator('[data-view-type="object_detail"]').first()
  if (await detailTab.isVisible()) await detailTab.click()
  await waitDetailReady(page)
}

test.describe('attribute description (row 308)', () => {
  const helpText = 'ROW308 brand description for editors'

  test('set, persist in grid and detail, then clear', async ({ page }) => {
    test.setTimeout(180_000)
    let original = ''
    try {
    await login(page)
    original = await brandDescription(page)
    const table = await openProductAttributes(page)
    await table.getByTestId('quick-filter').fill('brand')
    const row = table.locator('[data-key="brand"]')
    await editBrandDescription(row, helpText)

    const staged = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await table.getByTestId('review-and-save').click()
    const review = page.getByTestId('review-dialog')
    if (await review.isVisible()) await review.getByRole('button', { name: 'Save' }).click()
    expect((await staged).ok()).toBeTruthy()
    expect((await saved).ok()).toBeTruthy()
    await expect.poll(() => brandDescription(page)).toBe(helpText)

    await page.reload()
    const reloaded = await openProductAttributes(page)
    await reloaded.getByTestId('quick-filter').fill('brand')
    await expect(reloaded.locator('[data-key="brand"]').locator('[data-column="description"]')).toContainText(helpText)

    await openProductDetail(page)
    await expect(page.getByTestId('detail-field-desc-brand')).toContainText(helpText)

    const clearedTable = await openProductAttributes(page)
    await clearedTable.getByTestId('quick-filter').fill('brand')
    const clearedRow = clearedTable.locator('[data-key="brand"]')
    await editBrandDescription(clearedRow, '')
    const clearStage = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    const clearSave = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await clearedTable.getByTestId('review-and-save').click()
    const clearReview = page.getByTestId('review-dialog')
    if (await clearReview.isVisible()) await clearReview.getByRole('button', { name: 'Save' }).click()
    expect((await clearStage).ok()).toBeTruthy()
    expect((await clearSave).ok()).toBeTruthy()
    await expect.poll(() => brandDescription(page)).toBe('')

    await page.reload()
    const afterClear = await openProductAttributes(page)
    await afterClear.getByTestId('quick-filter').fill('brand')
    await expect(afterClear.locator('[data-key="brand"]').locator('[data-column="description"]')).toContainText('—')

    await openProductDetail(page)
    await expect(page.getByTestId('detail-field-desc-brand')).toHaveCount(0)

    } finally {
      try {
        if (original.trim()) {
          await stageAndSave(page, [{ op: 'update_attribute', key: 'brand', description: original }])
        } else {
          await stageAndSave(page, [{ op: 'update_attribute', key: 'brand', clear_description: true }])
        }
      } catch {
        // Restore best effort after a failed assertion.
      }
      await page.request.delete('/v1/model/draft').catch(() => undefined)
    }
  })
})