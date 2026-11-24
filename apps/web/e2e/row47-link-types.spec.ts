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

async function saveModelDraft(page: Page) {
  await page.keyboard.press('Control+S')
  const review = page.getByTestId('review-dialog')
  if (await review.isVisible()) {
    await page.getByTestId('confirm-review').click()
  }
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
}

async function linkTypeDef(page: Page, key: string) {
  const body = (await (await page.request.get('/v1/definitions')).json()) as {
    types?: Array<{ key?: string; kind?: string; link?: Record<string, unknown> }>
  }
  return body.types?.find((item) => item.key === key)
}

test('link types are editable with blocking cardinality (row 47)', async ({ page }) => {
  test.setTimeout(240_000)
  const linkKey = `row47_${crypto.randomUUID().slice(0, 8)}`
  await login(page)
  await command(page, 'Data model')
  await page.locator('.pane-tab', { hasText: 'Link types' }).first().click()
  const table = page.getByTestId('link-types-table')
  await expect(table).toBeVisible()
  await table.getByTestId('table-add-row').click()
  const dialog = page.getByTestId('create-dialog')
  await dialog.getByTestId('new-name').fill('Row47 Supplier')
  await dialog.getByTestId('link-type-from').click()
  await page.getByRole('option', { name: 'product' }).click()
  await dialog.getByTestId('link-type-to').click()
  await page.getByRole('option', { name: 'supplier' }).click()
  await dialog.getByTestId('link-type-from-label').fill('Suppliers')
  await dialog.getByTestId('link-type-to-label').fill('Product supplier')
  await dialog.getByTestId('link-type-to-cardinality').click()
  await page.getByRole('option', { name: 'Many' }).click()
  await dialog.getByTestId('create-object').click()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  const row = table.locator('[data-key]').filter({ has: page.getByText('Suppliers') }).first()
  await expect(row).toBeVisible()
  const rowId = await row.getAttribute('data-row-id')
  expect(rowId).toBeTruthy()
  const rowKey = await row.getAttribute('data-key')
  await row.locator('[data-column="key"]').dblclick()
  await row.getByTestId('standard-cell-editor').fill(linkKey)
  await row.getByTestId('standard-cell-editor').press('Enter')
  await row.click()
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const attributes = page.getByTestId('attribute-table')
  await expect(attributes).toBeVisible()
  await attributes.getByTestId('table-add-row').click()
  const attrCreate = page.getByTestId('create-dialog')
  await attrCreate.getByTestId('new-name').fill('Sort order')
  await attrCreate.getByTestId('create-object').click()
  await expect(attributes.locator('[data-key="sort_order"]')).toBeVisible()
  await saveModelDraft(page)

  const stored = await linkTypeDef(page, linkKey)
  expect(stored?.kind).toBe('link')
  expect(stored?.link).toMatchObject({
    from_cardinality: 'many',
    to_cardinality: 'many',
  })

  await page.reload()
  await command(page, 'Data model')
  await page.locator('.pane-tab', { hasText: 'Link types' }).first().click()
  const reloaded = page.getByTestId('link-types-table').locator(`[data-row-id="${rowId}"]`)
  await expect(reloaded).toBeVisible()
  await reloaded.locator('[data-column="fromLabel"]').dblclick()
  await reloaded.getByTestId('standard-cell-editor').fill('Vendor list')
  await reloaded.getByTestId('standard-cell-editor').press('Enter')
  await saveModelDraft(page)
  const relabeled = await linkTypeDef(page, linkKey)
  expect(String((relabeled?.link as { from_label?: { labels?: Record<string, string> } })?.from_label?.labels?.en ?? '')).toBe('Vendor list')

  const search = await page.request.get('/v1/search?q=*&filter=type_key:=product&per_page=1')
  const product = (((await search.json()) as { hits?: Array<{ document?: { id?: string; key?: string } }> }).hits ?? [])[0]?.document
  expect(product?.id).toBeTruthy()
  const searchSup = await page.request.get('/v1/search?q=*&filter=type_key:=supplier&per_page=2')
  const suppliers = (((await searchSup.json()) as { hits?: Array<{ document?: { id?: string; key?: string } }> }).hits ?? [])
    .map((hit) => hit.document)
    .filter((doc) => doc?.id)
  expect(suppliers.length).toBeGreaterThanOrEqual(2)
  for (const supplier of suppliers.slice(0, 2)) {
    await page.request.post('/v1/links', {
      data: {
        type: linkKey,
        from_id: product!.id,
        to_id: supplier!.id,
        values: { sort_order: 1 },
      },
    })
  }

  await page.locator('.pane-tab', { hasText: 'Link types' }).first().click()
  const editRow = page.getByTestId('link-types-table').locator(`[data-row-id="${rowId}"]`)
  await editRow.locator('[data-column="fromCardinality"]').dblclick()
  await editRow.getByTestId('standard-cell-editor').click()
  await page.getByRole('option', { name: 'One' }).click()
  await page.keyboard.press('Control+S')
  const review = page.getByTestId('review-dialog')
  await expect(review).toBeVisible()
  await expect(review.locator('.error')).toContainText(product!.key)
  await review.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  const after = await linkTypeDef(page, linkKey)
  expect(after?.link).toMatchObject({ from_cardinality: 'many' })
})