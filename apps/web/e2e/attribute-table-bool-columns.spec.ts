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

async function openDataModel(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  await expect(page.locator('.pane-tab').filter({ hasText: 'Structures' }).first()).toBeVisible({ timeout: 30_000 })
}

/** Type attributes for a seeded object type. Row id is the type key. */
async function openTypeAttributes(page: Page, typeKey: string) {
  await openDataModel(page)
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator(`[data-row-id="${typeKey}"]`)
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

/**
 * Seed food tree: Dairy & eggs owns Fat content; Yoghurt inherits it.
 * Scope the Structures pane (several panes use data-testid=data-model).
 */
async function openInheritedAttributes(page: Page) {
  await openDataModel(page)
  await page.locator('.pane-tab').filter({ hasText: 'Structures' }).first().click()
  const tree = () => page.getByTestId('data-model').filter({ has: page.getByTestId('group-dairy') }).first()
  await expect(tree().getByTestId('group-dairy')).toBeVisible()
  await expect(async () => {
    const dairy = tree().getByTestId('group-dairy')
    const button = dairy.getByRole('button', { name: 'Dairy & eggs' })
    if ((await button.getAttribute('aria-expanded')) !== 'true') {
      await dairy.locator('.twist').click({ timeout: 3_000 })
    }
    await expect(tree().getByTestId('group-yoghurt')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await expect(async () => {
    await tree().getByTestId('group-yoghurt').locator('.model-node').click({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  const table = page.getByTestId('attribute-table')
  await expect(table.getByTestId('attribute-row-inherited').first()).toBeVisible()
  return table
}

async function cellCursor(cell: Locator) {
  return cell.evaluate((element) => getComputedStyle(element).cursor)
}

test('attribute table bool columns use Braian checkboxes with pointer on enabled cells', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const table = await openTypeAttributes(page, 'product')
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

  const articleTable = await openTypeAttributes(page, 'article')
  await articleTable.getByTestId('quick-filter').fill('net weight')
  const numberRow = articleTable.locator('[data-key="net_weight"]')
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
  const table = await openTypeAttributes(page, 'product')
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
  const table = await openTypeAttributes(page, 'article')
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
