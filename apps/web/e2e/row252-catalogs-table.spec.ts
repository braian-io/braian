import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function command(page: Page, query: string) {
  await page.keyboard.press('Control+K')
  const input = page.getByTestId('palette-input')
  await expect(input).toBeVisible()
  await input.fill(query)
  await page.keyboard.press('Enter')
}

async function openCatalogsTable(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: 'Sources' }).click()
  await page.locator('.pane-tab-list').getByRole('button', { name: 'Catalogs', exact: true }).click()
  const table = page.getByTestId('catalogs-table-chrome')
  await expect(table).toBeVisible()
  return table
}

async function expectInCatalogPicker(page: Page, label: string) {
  const selector = page.getByTestId('catalog-selector')
  await selector.click()
  await expect(page.getByTestId('catalog-selector-menu').getByRole('menuitem', { name: label })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('catalog-selector-menu')).toHaveCount(0)
}

async function editCell(page: Page, table: Locator, row: Locator, columnId: 'key' | 'name', value: string) {
  await row.locator(`[data-column="${columnId}"]`).dblclick()
  const editor = table.getByTestId('standard-cell-editor')
  await expect(editor).toBeVisible()
  await editor.fill(value)
  const saved = page.waitForResponse((response) =>
    response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
  await page.keyboard.press('Enter')
  expect((await saved).ok()).toBeTruthy()
  await expect(table.getByTestId('review-and-save')).toHaveCount(0)
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
}

async function deleteCatalog(page: Page, key: string) {
  await page.request.post('/v1/model/draft/steps', {
    data: { steps: [{ op: 'delete_catalog', key }] },
  })
  await page.request.post('/v1/model/draft/save', { data: {} })
}

test('catalogs table creates, renames and deletes a source catalog', async ({ page }) => {
  test.setTimeout(180_000)
  const suffix = Date.now().toString(36)
  const key = `e2ecat${suffix}`
  const createdName = `E2E ${suffix}`
  const renamed = `E2E catalog ${suffix}`

  await login(page)
  const table = await openCatalogsTable(page)

  try {
    await table.getByTestId('table-add-row').click()
    const draftRow = table.locator('[data-row-id^="catalog-new-"]').last()
    await expect(draftRow).toBeVisible()
    await editCell(page, table, draftRow, 'key', key)
    let row = table.locator(`[data-testid="catalog-row"][data-key="${key}"]`)
    await expect(row).toBeVisible()
    await row.click()
    await command(page, 'Rename catalog')
    await editCell(page, table, row, 'name', createdName)

    await expect.poll(async () => {
      const catalogs = (await (await page.request.get('/v1/catalogs')).json()) as Array<{ key?: string }>
      return catalogs.some((entry) => entry.key === key)
    }).toBe(true)
    await expectInCatalogPicker(page, createdName)

    row = table.locator(`[data-testid="catalog-row"][data-key="${key}"]`)
    await row.click()
    await command(page, 'Rename catalog')
    await editCell(page, table, row, 'name', renamed)
    await expect(row).toContainText(renamed)
    await expectInCatalogPicker(page, renamed)

    await row.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete catalog' }).click()
    const reviewDialog = page.getByTestId('review-dialog')
    await expect(reviewDialog).toBeVisible({ timeout: 60_000 })
    await reviewDialog.getByTestId('confirm-review').click()
    await expect(reviewDialog).toHaveCount(0, { timeout: 60_000 })
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 60_000 })
    await expect.poll(async () => {
      const catalogs = (await (await page.request.get('/v1/catalogs')).json()) as Array<{ key?: string }>
      return !catalogs.some((entry) => entry.key === key)
    }, { timeout: 60_000 }).toBe(true)
    await page.getByTestId('catalog-selector').click()
    await expect(page.getByTestId('catalog-selector-menu').getByRole('menuitem', { name: renamed })).toHaveCount(0)
    await page.keyboard.press('Escape')
  } finally {
    await deleteCatalog(page, key).catch(() => undefined)
  }
})