import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const BOOL_COLUMNS = ['Required', 'Show by default', 'Languages', 'Searchable'] as const

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

async function openInheritedAttributes(page: Page) {
  await page.getByRole('button', { name: 'Data model' }).click()
  await expect(page.locator('.pane-tab').filter({ hasText: 'Structures' })).toBeVisible({ timeout: 30_000 })
  const tree = page.getByTestId('data-model').first()
  await expect(tree.getByTestId('group-dairy')).toBeVisible()
  await tree.getByTestId('group-dairy').locator('.twist').click()
  await expect(async () => {
    await page.getByTestId('data-model').first().getByTestId('group-yoghurt').locator('.model-node').click({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

async function cellCursor(cell: Locator) {
  return cell.evaluate((element) => getComputedStyle(element).cursor)
}

test('attribute table bool columns use Braian checkboxes with pointer on enabled cells', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const table = await openProductAttributes(page)
  await table.getByTestId('quick-filter').fill('description')
  const row = table.locator('[data-key="description"]')
  await expect(row).toBeVisible()

  for (const label of BOOL_COLUMNS) {
    const cell = row.locator(`.standard-grid-cell-bool[data-column="${boolColumnId(label)}"]`)
    await expect(cell).toBeVisible()
    await expect(cell).not.toHaveAttribute('data-disabled', 'true')
    await expect(cellCursor(cell)).resolves.toBe('pointer')
    const checkbox = row.getByRole('checkbox', { name: label })
    await expect(checkbox).toBeEnabled()
    await expect(checkbox).toHaveClass(/check/)
    const before = await checkbox.isChecked()
    await checkbox.focus()
    await page.keyboard.press('Space')
    const after = await checkbox.isChecked()
    expect(after).toBe(!before)
    await checkbox.click()
    if (before) await expect(checkbox).toBeChecked()
    else await expect(checkbox).not.toBeChecked()
  }

  await table.getByTestId('quick-filter').fill('net weight')
  const numberRow = table.locator('[data-key="net_weight"]')
  await expect(numberRow).toBeVisible()
  const languagesCell = numberRow.locator('.standard-grid-cell-bool[data-column="languages"]')
  await expect(languagesCell).toHaveAttribute('data-disabled', 'true')
  await expect(cellCursor(languagesCell)).resolves.toBe('default')
  await expect(numberRow.getByRole('checkbox', { name: 'Languages' })).toBeDisabled()
})

test('inherited attribute rows keep disabled bool cells non-interactive', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const table = await openInheritedAttributes(page)
  const inherited = table.getByTestId('attribute-row-inherited').first()
  await expect(inherited).toBeVisible()
  for (const label of BOOL_COLUMNS) {
    const cell = inherited.locator(`.standard-grid-cell-bool[data-column="${boolColumnId(label)}"]`)
    await expect(cell).toHaveAttribute('data-disabled', 'true')
    await expect(cellCursor(cell)).resolves.toBe('default')
    const checkbox = inherited.getByRole('checkbox', { name: label })
    await expect(checkbox).toBeDisabled()
    await expect(checkbox).toHaveClass(/check/)
  }
})

test('Tab from Kind focuses Required and Shift+Tab returns to the editor', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const table = await openProductAttributes(page)
  await table.getByTestId('quick-filter').fill('description')
  const row = table.locator('[data-key="description"]')
  await row.locator('[data-column="kind"]').dblclick()
  const editor = row.getByTestId('standard-cell-editor')
  await expect(editor).toBeFocused()
  await page.keyboard.press('Tab')
  const required = row.getByRole('checkbox', { name: 'Required' })
  await expect(required).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(row.getByTestId('standard-cell-editor')).toBeFocused()
})

test('Tab from Unit on a number attribute focuses Required and skips disabled Languages', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const table = await openProductAttributes(page)
  await table.getByTestId('quick-filter').fill('net weight')
  const row = table.locator('[data-key="net_weight"]')
  await row.locator('[data-column="unit"]').dblclick()
  await expect(row.getByTestId('standard-cell-editor')).toBeFocused()
  await page.keyboard.press('Tab')
  const required = row.getByRole('checkbox', { name: 'Required' })
  await expect(required).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(row.getByRole('checkbox', { name: 'Show by default' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(row.getByRole('checkbox', { name: 'Searchable' })).toBeFocused()
  await expect(row.getByRole('checkbox', { name: 'Languages' })).toBeDisabled()
})

function boolColumnId(label: (typeof BOOL_COLUMNS)[number]) {
  switch (label) {
    case 'Required':
      return 'required'
    case 'Show by default':
      return 'showByDefault'
    case 'Languages':
      return 'languages'
    case 'Searchable':
      return 'searchable'
  }
}
