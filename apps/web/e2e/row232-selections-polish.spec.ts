import { expect, test, type Locator, type Page } from '@playwright/test'
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

async function openProducts(page: Page) {
  await page.locator('.pane-tab-list').getByRole('button', { name: 'Products', exact: true }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openSelections(page: Page) {
  await page.locator('.pane-tab', { hasText: 'Selections' }).first().click()
  await expect(page.getByTestId('assortment-list')).toBeVisible()
}

function selectionRow(page: Page, name: string) {
  return page.getByTestId('assortment-list').getByTestId('assortment-row').filter({ hasText: name })
}

async function rowCount(table: Locator) {
  const text = await table.getByTestId('row-count').innerText()
  const match = text.match(/[\d,]+/)
  return match ? Number(match[0].replace(/,/g, '')) : Number.NaN
}

function formatCount(count: number) {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(count)
}

async function runPalette(page: Page, command: string) {
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill(command)
  await expect(palette.locator('.hit').filter({ hasText: command }).first()).toBeVisible()
  await page.keyboard.press('Enter')
}

test('an invalid filter is rejected at Save with an inline query error', async ({ page }) => {
  await login(page)
  await openSelections(page)
  const name = `Cheddar text ${Date.now().toString(36)}`
  await page.getByTestId('new-selection-button').click()
  const draft = page.getByTestId('selection-detail')
  await expect(draft).toBeVisible()
  await page.getByTestId('assortment-name').fill(name)
  await page.getByTestId('selection-kind').selectOption('dynamic')
  await page.getByTestId('selection-query').fill('cheddar')
  const response = page.waitForResponse(
    (item) => item.url().includes('/v1/assortments') && item.request().method() === 'POST',
  )
  await draft.getByTestId('review-and-save').click()
  expect((await response).status()).toBe(422)
  await expect(draft.getByTestId('selection-query-error')).toContainText('Could not parse the filter query')
  await expect(draft).toBeVisible()
  await expect(selectionRow(page, name)).toHaveCount(0)
})

test('save filter as selection keeps the table search term', async ({ page }) => {
  await login(page)
  await openProducts(page)
  const table = mainTable(page)
  const before = await rowCount(table)
  expect(before).toBeGreaterThan(1)
  await table.getByTestId('quick-filter').fill('oat')
  await expect(table.getByTestId('object-row').filter({ hasText: 'PROD-OAT' }).first()).toBeVisible()
  await expect.poll(async () => rowCount(table)).toBeLessThan(before)
  await expect(table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' })).toHaveCount(0)
  const found = await rowCount(table)

  await runPalette(page, 'Save filter as selection')
  const draft = page.getByTestId('selection-detail')
  await expect(draft).toBeVisible()
  await expect(page.getByTestId('selection-query')).toHaveValue(/type_key:=product/)
  await expect(page.getByTestId('selection-search')).toHaveValue('oat')
  const name = `Oat search ${Date.now().toString(36)}`
  await page.getByTestId('assortment-name').fill(name)
  await draft.getByTestId('review-and-save').click()
  await expect(draft).toHaveCount(0)

  await openSelections(page)
  const row = selectionRow(page, name)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name }).click()
  const open = page.getByTestId('assortment-open')
  await expect(open).toContainText('PROD-OAT')
  await expect(open).toContainText(`${formatCount(found)} matching objects`)
  await expect(open.getByTestId('selection-search-chip')).toHaveText('oat')

  const saved = await (await page.request.get('/v1/assortments?type=product')).json()
  const selection = (saved.assortments as Array<{ name: string; query: { filter?: string; q?: string } }>).find(
    (item) => item.name === name,
  )
  expect(selection?.query.filter ?? '').toContain('type_key:=product')
  expect(selection?.query.q).toBe('oat')
})

test('the unsaved counter waits for an edit and stays inside a narrow pane', async ({ page }) => {
  await login(page)
  await openSelections(page)
  await page.getByTestId('new-selection-button').click()
  const draft = page.getByTestId('selection-detail')
  await expect(draft).toBeVisible()
  await expect(draft.getByTestId('object-draft-bar')).toHaveCount(0)
  await expect(draft.getByTestId('selection-hint')).toContainText('Add to selection')

  await page.getByTestId('assortment-name').fill('A')
  const label = draft.getByTestId('object-draft-bar').locator('span').first()
  await expect(label).toHaveText('1 unsaved change')

  await page.getByTestId('selection-kind').selectOption('dynamic')
  await expect(draft.getByTestId('selection-hint')).toContainText('follows a filter query')
  await expect(draft.getByTestId('selection-hint')).not.toContainText(/filled by hand/i)
  await expect(label).toHaveText('2 unsaved changes')

  const pane = page.locator('section.pane').filter({ has: draft }).first()
  const paneBox = await pane.boundingBox()
  expect(paneBox).toBeTruthy()
  if (!paneBox) return
  for (const id of ['review-and-save', 'discard-draft']) {
    const box = await draft.getByTestId(id).boundingBox()
    expect(box, id).toBeTruthy()
    if (!box) continue
    expect(box.x).toBeGreaterThanOrEqual(paneBox.x - 1)
    expect(box.x + box.width).toBeLessThanOrEqual(paneBox.x + paneBox.width + 1)
    expect(box.y).toBeGreaterThanOrEqual(paneBox.y - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(paneBox.y + paneBox.height + 1)
  }
})

test('saving with an empty name shows an inline name error', async ({ page }) => {
  await login(page)
  await openSelections(page)
  await page.getByTestId('new-selection-button').click()
  const draft = page.getByTestId('selection-detail')
  await expect(draft).toBeVisible()
  await page.getByTestId('assortment-name').press('Enter')
  await expect(draft.getByTestId('selection-name-error')).toContainText('Enter a name.')
  await expect(draft).toBeVisible()

  await page.getByTestId('selection-kind').selectOption('dynamic')
  await draft.getByTestId('review-and-save').click()
  await expect(draft.getByTestId('selection-name-error')).toContainText('Enter a name.')
  await expect(draft).toBeVisible()
})

test('deleting a manual selection does not say Loading on confirm', async ({ page }) => {
  await login(page)
  await openSelections(page)
  const name = `Hand list ${Date.now().toString(36)}`
  await page.getByTestId('new-selection-button').click()
  const draft = page.getByTestId('selection-detail')
  await expect(draft).toBeVisible()
  await expect(draft.getByTestId('selection-hint')).toContainText('Add to selection')
  await page.getByTestId('assortment-name').fill(name)
  await draft.getByTestId('review-and-save').click()
  await expect(draft).toHaveCount(0)

  const row = selectionRow(page, name)
  await expect(row).toBeVisible()
  await row.getByTestId('selection-menu').click()
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Delete selection' }).click()
  const confirm = page.getByTestId('delete-selection')
  await expect(confirm).toBeVisible()
  await expect(confirm).not.toContainText('Loading…')
  const remove = confirm.getByRole('button', { name: 'Delete', exact: true })
  await expect(remove).toBeEnabled()
  await expect(confirm.getByTestId('selection-usage')).toContainText('Not used by a saved view')
  await expect(confirm).not.toContainText('Loading…')
  await remove.click()
  await expect(confirm).toBeHidden()
  await expect(selectionRow(page, name)).toHaveCount(0)
})
