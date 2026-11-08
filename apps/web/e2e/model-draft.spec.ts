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

async function command(page: Page, title: string) {
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('palette-input')
  await expect(palette).toBeVisible()
  await palette.fill(title)
  await page.keyboard.press('Enter')
}

async function openObjectTypes(page: Page) {
  const tab = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  const table = page.getByTestId('object-types-table')
  await expect(table).toBeVisible()
  return table
}

async function openTypeAttributes(page: Page, typeKey: string) {
  const table = await openObjectTypes(page)
  const row = table.locator(`[data-row-id="${typeKey}"]`)
  await expect(async () => {
    await row.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  const tab = page.locator('.pane-tab', { hasText: 'Type attributes' }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  const attributes = page.getByTestId('attribute-table')
  await expect(attributes).toBeVisible()
  return { table, row, attributes }
}

test('a type is built in a draft, saved, and deleted from the keyboard', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await command(page, 'Data model')
  await expect(page.getByTestId('data-model').first()).toBeVisible()

  // Cancel a create dialog without staging anything.
  await command(page, 'New type')
  const cancelled = page.getByTestId('model-dialog')
  await expect(cancelled).toBeVisible()
  await page.getByTestId('model-dialog-name').fill('Discarded')
  await cancelled.getByRole('button', { name: 'Cancel' }).click()
  await expect(cancelled).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

  await command(page, 'New type')
  await page.getByTestId('model-dialog-name').fill('Recipe')
  await page.getByTestId('model-dialog-save').click()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()

  await command(page, 'New value list')
  await page.getByTestId('model-dialog-name').fill('Difficulty')
  await page.getByTestId('model-dialog-options').fill('Easy, Hard')
  await page.getByTestId('model-dialog-save').click()

  const { attributes } = await openTypeAttributes(page, 'recipe')

  await attributes.getByTestId('table-add-row').click()
  const create = page.getByTestId('create-dialog')
  await expect(create).toBeVisible()
  await create.getByTestId('new-name').fill('Servings')
  await create.getByTestId('new-type').click()
  await page.getByRole('option', { name: 'Number' }).click()
  await create.getByTestId('create-object').click()
  await expect(create).toHaveCount(0)

  const servings = attributes.locator('[data-key="servings"]')
  await expect(servings).toBeVisible()
  await servings.locator('[data-column="unit"]').dblclick()
  const unit = servings.getByTestId('standard-cell-editor')
  await expect(unit).toBeFocused()
  await unit.selectOption('mass')
  await unit.press('Enter')
  await expect(servings.locator('[data-column="unit"]')).toContainText('mass')

  await servings.getByTestId('attr-menu-servings').click()
  const min = page.getByLabel('Min', { exact: true })
  await min.fill('1')
  await expect(min).toHaveValue('1')
  const max = page.getByLabel('Max', { exact: true })
  await max.fill('12')
  await expect(max).toHaveValue('12')
  await page.keyboard.press('Escape')

  await expect(page.getByTestId('unsaved-changes')).toContainText('unsaved')
  const saved = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await attributes.getByTestId('review-and-save').click()
  expect((await saved).ok()).toBeTruthy()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

  const types = await openObjectTypes(page)
  const typeRow = types.locator('[data-row-id="recipe"]')
  await expect(typeRow).toBeVisible()

  const persistedKind = async () => {
    const body = (await (await page.request.get('/v1/definitions')).json()) as {
      attributes?: Array<{ key?: string; kind?: Record<string, unknown> }>
    }
    return body.attributes?.find((item) => item.key === 'servings')?.kind
  }
  await expect.poll(persistedKind).toMatchObject({ type: 'number', unit_family: expect.any(String), min: '1', max: '12' })

  const created = await page.request.post('/v1/operations/model.create_attribute', {
    data: { key: 'recipe_note', label: 'Recipe note', kind: 'text' },
  })
  expect(created.ok()).toBeTruthy()
  const proposal = await created.json()
  expect(proposal.needs_approval).toBe(true)

  await typeRow.click({ button: 'right' })
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Delete…' }).click()
  const dialog = page.getByTestId('consequence')
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(typeRow).toBeVisible()

  await command(page, 'Delete type')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input')).toHaveCount(0)
  await page.getByTestId('confirm-delete').click()
  await expect(dialog).toBeHidden()
  await expect(types.locator('[data-row-id="recipe"]')).toHaveCount(0)
})
