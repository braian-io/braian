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

async function openCatalogsTable(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: 'Sources' }).click()
  await page.locator('.pane-tab-list').getByRole('button', { name: 'Catalogs', exact: true }).click()
  const table = page.getByTestId('catalogs-table-chrome')
  await expect(table).toBeVisible()
  return table
}

async function editCell(row: Locator, column: string, value: string, page: Page) {
  const cell = row.locator(`[data-column="${column}"]`)
  await row.click()
  await cell.click()
  await page.keyboard.press('F2')
  const editor = page.getByTestId('standard-cell-editor')
  await expect(editor).toBeVisible()
  await editor.fill(value)
  await page.keyboard.press('Enter')
}

async function expectInCatalogPicker(page: Page, label: string) {
  const selector = page.getByTestId('catalog-selector')
  await selector.click()
  await expect(page.getByTestId('catalog-selector-menu').getByRole('menuitem', { name: label })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('catalog-selector-menu')).toHaveCount(0)
}

async function saveDraft(page: Page, table: ReturnType<Page['getByTestId']>) {
  const save = table.getByTestId('review-and-save')
  await expect(save).toBeVisible()
  await save.click()
  const dialog = page.getByTestId('review-dialog')
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
  }
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
}

async function deleteCatalog(page: Page, key: string) {
  const response = await page.request.get('/v1/catalogs')
  if (!response.ok()) return
  const catalogs = (await response.json()) as Array<{ id?: string; key?: string }>
  const row = catalogs.find((item) => item.key === key)
  if (!row?.id) return
  await page.request.post('/v1/model/draft/steps', {
    data: { steps: [{ op: 'delete_catalog', key }] },
  })
  await page.request.post('/v1/model/draft/save', { data: {} })
}

test('catalogs table creates, renames and deletes a source catalog', async ({ page }) => {
  test.setTimeout(180_000)
  const suffix = Date.now().toString(36)
  const key = `e2e-cat-${suffix}`
  const renamed = `E2E catalog ${suffix}`

  await login(page)
  const table = await openCatalogsTable(page)

  try {
    await table.getByTestId('table-add-row').click()
    const draftRow = table.locator('[data-testid="catalog-row"][data-key^="catalog-new-"]').first()
    await expect(draftRow).toBeVisible()
    await editCell(draftRow, 'key', key, page)
    await editCell(draftRow, 'name', `E2E ${suffix}`, page)

    await saveDraft(page, table)
    await expect.poll(async () => {
      const catalogs = (await (await page.request.get('/v1/catalogs')).json()) as Array<{ key?: string }>
      return catalogs.some((row) => row.key === key)
    }).toBe(true)
    await expectInCatalogPicker(page, `E2E ${suffix}`)

    const saved = table.locator(`[data-testid="catalog-row"][data-key="${key}"]`)
    await saved.click()
    await editCell(saved, 'name', renamed, page)
    await saveDraft(page, table)
    await expect(saved).toContainText(renamed)
    await expectInCatalogPicker(page, renamed)

    await saved.click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Delete catalog' }).click()
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 60_000 })
    await expect.poll(async () => {
      const catalogs = (await (await page.request.get('/v1/catalogs')).json()) as Array<{ key?: string }>
      return !catalogs.some((row) => row.key === key)
    }).toBe(true)
    await page.getByTestId('catalog-selector').click()
    await expect(page.getByTestId('catalog-selector-menu').getByRole('menuitem', { name: renamed })).toHaveCount(0)
    await page.keyboard.press('Escape')
  } finally {
    await deleteCatalog(page, key).catch(() => undefined)
  }
})