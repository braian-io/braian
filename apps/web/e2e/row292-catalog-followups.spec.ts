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

async function openCatalogsTable(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: 'Sources' }).click()
  await page.locator('.pane-tab-list').getByRole('button', { name: 'Catalogs', exact: true }).click()
  const table = page.getByTestId('catalogs-table-chrome')
  await expect(table).toBeVisible()
  return table
}

async function openPalette(page: Page, query: string) {
  await page.keyboard.press('Control+K')
  const input = page.getByTestId('palette-input')
  await expect(input).toBeVisible()
  await input.fill(query)
}

test('delete catalog stays hidden until a row is selected and the master cannot be deleted', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const table = await openCatalogsTable(page)
  const master = table.locator('[data-key="master"]')
  const sap = table.locator('[data-key="sap"]')
  await expect(master).toBeVisible()
  await expect(sap).toBeVisible()

  await openPalette(page, 'Delete catalog')
  await expect(page.getByRole('option', { name: /^Delete catalog\b/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(master).toBeVisible()

  await sap.click()
  await openPalette(page, 'Delete catalog')
  await expect(page.getByRole('option', { name: /^Delete catalog\b/ })).toBeVisible()
  await page.keyboard.press('Escape')

  await master.click()
  await openPalette(page, 'Delete catalog')
  const deleteCatalog = page.getByRole('option', { name: /^Delete catalog\b/ })
  await expect(deleteCatalog).toBeVisible()
  await deleteCatalog.click()
  await expect(page.getByTestId('catalog-inline-message')).toContainText('The master catalog cannot be deleted.')
  await expect(master).toBeVisible()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
})

test('catalog keys stay locked in the table and on the server', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const table = await openCatalogsTable(page)

  for (const key of ['master', 'sap']) {
    const cell = table.locator(`[data-key="${key}"] [data-column="key"]`)
    await expect(cell).toHaveAttribute('data-disabled', 'true')
    await cell.dblclick()
    await expect(table.getByTestId('standard-cell-editor')).toHaveCount(0)
  }

  const discarded = await page.request.delete('/v1/model/draft')
  expect(discarded.ok(), await discarded.text()).toBe(true)

  for (const [from, to, detail] of [
    ['master', 'not-master', 'master catalog key'],
    ['sap', 'not-sap', 'cannot be changed after creation'],
  ] as const) {
    const staged = await page.request.post('/v1/model/draft/steps', {
      data: {
        steps: [{
          op: 'upsert_catalog',
          catalog: {
            key: to,
            renamed_from: from,
            name: from === 'master' ? 'Master catalog' : 'SAP',
            kind: from === 'master' ? 'master' : 'source',
            editable: from !== 'master',
          },
        }],
      },
    })
    expect(staged.status(), await staged.text()).toBe(422)
    const problem = await staged.json() as { code?: string; detail?: string }
    expect(problem.code).toBe('catalog_key_locked')
    expect(problem.detail ?? '').toContain(detail)
    const current = await page.request.get(`/v1/catalogs/${from}`)
    expect(current.ok()).toBe(true)
    const body = await current.json() as { key?: string }
    expect(body.key).toBe(from)
  }
})
