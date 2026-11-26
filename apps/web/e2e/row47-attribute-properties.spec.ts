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

async function modelCreateCommand(page: Page, title: string) {
  await command(page, title)
  const dialog = page.getByTestId('model-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  return dialog
}

async function saveModelDialog(page: Page) {
  await page.getByTestId('model-dialog-save').click()
  await expect(page.getByTestId('model-dialog')).toHaveCount(0, { timeout: 30_000 })
}

async function openTypeAttributes(page: Page, typeKey: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
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

type AttributeKind = {
  type?: string
  max_length?: number
  form?: string
  min?: string
  max?: string
  integer?: boolean
  list?: string
}

async function attributeKind(page: Page, key: string) {
  const body = (await (await page.request.get('/v1/definitions')).json()) as {
    attributes?: Array<{ key?: string; kind?: AttributeKind; multiple?: boolean; index?: { filterable?: boolean } }>
  }
  const row = body.attributes?.find((item) => item.key === key)
  return {
    kind: row?.kind,
    multiple: Boolean(row?.multiple),
    filterable: Boolean(row?.index?.filterable),
  }
}

test('type attribute rule columns stage, save, and restore (row 47)', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await command(page, 'Data model')
  await expect(page.getByTestId('data-model').first()).toBeVisible({ timeout: 60_000 })

  await modelCreateCommand(page, 'New value list')
  await page.getByTestId('model-dialog-name').fill('ROW47 Colors')
  await page.getByTestId('model-dialog-options').fill('Red, Blue')
  await saveModelDialog(page)

  await modelCreateCommand(page, 'New type')
  await page.getByTestId('model-dialog-name').fill('ROW47 Demo')
  await saveModelDialog(page)

  const attributes = await openTypeAttributes(page, 'row47_demo')

  await attributes.getByTestId('table-add-row').click()
  let create = page.getByTestId('create-dialog')
  await create.getByTestId('new-name').fill('ROW47 Note')
  await create.getByTestId('create-object').click()
  const noteRow = attributes.locator('[data-key="row47_note"]')
  await noteRow.locator('[data-column="maxLength"]').dblclick()
  await noteRow.getByTestId('standard-cell-editor').fill('40')
  await noteRow.getByTestId('standard-cell-editor').press('Enter')
  await noteRow.locator('[data-column="textForm"]').dblclick()
  await noteRow.getByTestId('standard-cell-editor').click()
  await page.getByRole('option', { name: 'Long text' }).click()
  await expect(noteRow.locator('[data-column="textForm"]')).toContainText('Long text')

  await attributes.getByTestId('table-add-row').click()
  create = page.getByTestId('create-dialog')
  await create.getByTestId('new-name').fill('ROW47 Count')
  await create.getByTestId('new-type').click()
  await page.getByRole('option', { name: 'Number' }).click()
  await create.getByTestId('create-object').click()
  const countRow = attributes.locator('[data-key="row47_count"]')
  await countRow.locator('[data-column="min"]').dblclick()
  await countRow.getByTestId('standard-cell-editor').fill('1')
  await countRow.getByTestId('standard-cell-editor').press('Enter')
  await countRow.locator('[data-column="max"]').dblclick()
  await countRow.getByTestId('standard-cell-editor').fill('12')
  await countRow.getByTestId('standard-cell-editor').press('Enter')
  await countRow.getByRole('checkbox', { name: 'Integer' }).click()
  await countRow.getByRole('checkbox', { name: 'Filterable' }).click()

  await attributes.getByTestId('table-add-row').click()
  create = page.getByTestId('create-dialog')
  await create.getByTestId('new-name').fill('ROW47 Color')
  await create.getByTestId('new-type').click()
  await page.getByRole('option', { name: 'Value list' }).click()
  await create.getByTestId('new-value-list').click()
  await page.getByRole('option', { name: 'row47_colors' }).click()
  await create.getByTestId('create-object').click()
  const colorRow = attributes.locator('[data-key="row47_color"]')
  await colorRow.getByRole('checkbox', { name: 'Multiple' }).click()

  const saved = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await attributes.getByTestId('review-and-save').click()
  const review = page.getByTestId('review-dialog')
  if (await review.isVisible()) {
    await review.getByRole('button', { name: 'Save' }).click()
  }
  expect((await saved).ok()).toBeTruthy()
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

  await expect.poll(() => attributeKind(page, 'row47_note')).toMatchObject({
    kind: { type: 'text', max_length: 40, form: 'long' },
  })
  await expect.poll(() => attributeKind(page, 'row47_count')).toMatchObject({
    kind: { type: 'number', min: '1', max: '12', integer: true },
    filterable: true,
  })
  await expect.poll(() => attributeKind(page, 'row47_color')).toMatchObject({
    kind: { type: 'value_list', list: expect.stringMatching(/row47.*color/i) },
    multiple: true,
  })

  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  const reloaded = await openTypeAttributes(page, 'row47_demo')
  const noteReloaded = reloaded.locator('[data-key="row47_note"]')
  await expect(noteReloaded.locator('[data-column="maxLength"]')).toContainText('40')
  await expect(noteReloaded.locator('[data-column="textForm"]')).toContainText('Long text')
  const countReloaded = reloaded.locator('[data-key="row47_count"]')
  await expect(countReloaded.locator('[data-column="max"]')).toContainText('12')
  await expect(countReloaded.getByRole('checkbox', { name: 'Integer' })).toBeChecked()

  await countReloaded.locator('[data-column="max"]').dblclick()
  const maxEditor = countReloaded.getByTestId('standard-cell-editor')
  await maxEditor.fill('')
  await maxEditor.press('Enter')
  await reloaded.getByTestId('review-and-save').click()
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
  await expect.poll(async () => (await attributeKind(page, 'row47_count')).kind?.max).toBeUndefined()

  const product = await openTypeAttributes(page, 'product')
  const brand = product.locator('[data-key="brand"]')
  await expect(brand.locator('[data-column="kind"]')).toHaveAttribute('data-disabled', 'true')
  await brand.locator('[data-column="kind"]').dblclick()
  await expect(brand.getByTestId('standard-cell-editor')).toHaveCount(0)

  const demo = await openTypeAttributes(page, 'row47_demo')
  const empty = demo.locator('[data-key="row47_note"]')
  await expect(empty.locator('[data-column="kind"]')).not.toHaveAttribute('data-disabled', 'true')
})