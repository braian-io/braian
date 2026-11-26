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

async function openDataModelTab(page: Page, label: string, tableTestId: string) {
  await page.getByRole('button', { name: 'Data model' }).click()
  const tab = page.locator('.pane-tab').filter({ hasText: label }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  const table = page.getByTestId(tableTestId)
  await expect(table).toBeVisible()
  return table
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

async function saveFrom(page: Page, reviewButton: ReturnType<Page['getByTestId']>) {
  const saved = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await reviewButton.click()
  const review = page.getByTestId('review-dialog')
  if (await review.isVisible()) {
    await review.getByRole('button', { name: 'Save' }).click()
  }
  expect((await saved).ok()).toBeTruthy()
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
}

async function waitIndexed(page: Page, seq: number) {
  if (seq <= 0) return
  const response = await page.request.get(`/v1/search?q=*&per_page=1&wait_seq=${seq}`)
  expect(response.ok(), await response.text()).toBeTruthy()
}

async function searchFound(page: Page, filter: string, seq: number) {
  const response = await page.request.get(
    `/v1/search?q=*&filter=${encodeURIComponent(filter)}&per_page=1&wait_seq=${seq}`,
  )
  if (!response.ok()) return -1
  const body = (await response.json()) as { found?: number }
  return body.found ?? 0
}

test('row307b new family from the unit dialog filters across an offset', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString(36)
  const family = `row307b_${stamp}`
  const attributeKey = `heat_${stamp}`
  const skuA = `ROW307B-A-${stamp}`
  const skuB = `ROW307B-B-${stamp}`
  const factor = '0,5555555555555555555555555556'
  const offset = '-17,777777777777777777777777778'

  await login(page)
  await page.request.delete('/v1/model/draft').catch(() => {})
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()

  const units = await openDataModelTab(page, 'Units', 'units-table')
  await units.getByTestId('table-add-row').click()
  let dialog = page.getByTestId('create-dialog')
  await expect(dialog.getByText('Enter a unit family and a unit.')).toBeVisible()
  await expect(dialog.getByText('Enter a name.')).toHaveCount(0)
  await dialog.getByTestId('new-name').fill(family)
  await dialog.getByTestId('new-key').fill('C')
  await dialog.getByTestId('new-factor').fill('nope')
  await dialog.getByTestId('create-object').click()
  await expect(dialog.getByTestId('validation-error')).toContainText('Enter a number.')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('new-factor').fill('1')
  await dialog.getByTestId('new-offset').fill('0')
  await dialog.getByTestId('new-symbol').fill('°C')
  await dialog.getByTestId('new-labels').fill('Celsius')
  await dialog.getByTestId('create-object').click()
  await expect(dialog).toHaveCount(0)
  const celsius = units.locator(`[data-row-id="${family}:C"]`)
  await expect(celsius).toBeVisible()

  await units.getByTestId('table-add-row').click()
  dialog = page.getByTestId('create-dialog')
  await dialog.getByTestId('new-name').fill(family)
  await dialog.getByTestId('new-key').fill('F')
  await dialog.getByTestId('new-factor').fill(factor)
  await dialog.getByTestId('new-offset').fill(offset)
  await dialog.getByTestId('new-symbol').fill('°F')
  await dialog.getByTestId('new-labels').fill('Fahrenheit')
  await dialog.getByTestId('create-object').click()
  await expect(dialog).toHaveCount(0)
  const fahrenheit = units.locator(`[data-row-id="${family}:F"]`)
  await expect(fahrenheit).toBeVisible()
  await expect(fahrenheit.locator('[data-column="labels"]')).toContainText('Fahrenheit')

  await fahrenheit.locator('[data-column="labels"]').dblclick()
  await fahrenheit.getByTestId('standard-cell-editor').fill('Boiling scale')
  await fahrenheit.getByTestId('standard-cell-editor').press('Enter')
  await fahrenheit.locator('[data-column="offset"]').dblclick()
  await fahrenheit.getByTestId('standard-cell-editor').fill(offset)
  await fahrenheit.getByTestId('standard-cell-editor').press('Enter')

  await saveFrom(page, units.getByTestId('review-and-save'))
  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()

  const stored = (await (await page.request.get('/v1/definitions')).json()) as {
    unit_families?: Array<{
      key?: string
      base_unit?: string
      units?: Array<{ code?: string; factor?: string; offset?: string; symbol?: string; labels?: { en?: string } }>
    }>
    attributes?: Array<{ id?: string; key?: string; kind?: { unit_family?: string; default_unit?: string } }>
  }
  const savedFamily = stored.unit_families?.find((item) => item.key === family)
  expect(savedFamily?.base_unit).toBe('C')
  const savedF = savedFamily?.units?.find((unit) => unit.code === 'F')
  expect(savedF?.factor).toBe('0.5555555555555555555555555556')
  expect(savedF?.offset).toBe('-17.777777777777777777777777778')
  expect(savedF?.symbol).toBe('°F')
  expect(savedF?.labels?.en).toBe('Boiling scale')

  const attributes = await openTypeAttributes(page, 'product')
  await attributes.getByTestId('table-add-row').click()
  const create = page.getByTestId('create-dialog')
  await create.getByTestId('new-name').fill(`Heat ${stamp}`)
  await create.getByTestId('new-type').click()
  await page.getByRole('option', { name: 'Number' }).click()
  await create.getByTestId('create-object').click()
  const row = attributes.locator(`[data-key="${attributeKey}"]`)
  await expect(row).toBeVisible()
  await row.locator('[data-column="unit"]').dblclick()
  await row.getByTestId('standard-cell-editor').selectOption(family)
  await row.getByTestId('standard-cell-editor').press('Enter')
  await expect(row.locator('[data-column="unit"]')).toContainText(family)
  await row.locator('[data-column="defaultUnit"]').dblclick()
  await row.getByTestId('standard-cell-editor').selectOption('C')
  await row.getByTestId('standard-cell-editor').press('Enter')
  await expect(row.locator('[data-column="unit"]')).toContainText(`${family} · °C`)
  await row.getByRole('checkbox', { name: 'Filterable' }).click()
  await saveFrom(page, attributes.getByTestId('review-and-save'))

  const defs = (await (await page.request.get('/v1/definitions')).json()) as typeof stored
  const attribute = defs.attributes?.find((item) => item.key === attributeKey)
  expect(attribute?.id).toBeTruthy()
  expect(attribute?.kind?.default_unit).toBe('C')
  const field = `a_${String(attribute?.id).replaceAll('-', '_')}`

  const createdA = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: {
        number: skuA,
        name: { en: `Row307b A ${stamp}` },
        status: 'draft',
        [attributeKey]: { value: '100', unit: 'C' },
      },
    },
  })
  expect(createdA.ok(), await createdA.text()).toBeTruthy()
  const createdB = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: {
        number: skuB,
        name: { en: `Row307b B ${stamp}` },
        status: 'draft',
        [attributeKey]: { value: '212', unit: 'F' },
      },
    },
  })
  expect(createdB.ok(), await createdB.text()).toBeTruthy()
  const seqA = ((await createdA.json()) as { seq?: number }).seq ?? 0
  const seqB = ((await createdB.json()) as { seq?: number }).seq ?? 0
  const writeSeq = Math.max(seqA, seqB)
  await waitIndexed(page, writeSeq)

  const baseFilter = (sku: string) => `type_key:=product&&key:=${sku}`
  await expect.poll(async () => {
    const a = await searchFound(page, `${baseFilter(skuA)}&&${field}:>90`, writeSeq)
    const b = await searchFound(page, `${baseFilter(skuB)}&&${field}:>90`, writeSeq)
    return a === 1 && b === 1 ? 1 : 0
  }, { timeout: 90_000 }).toBe(1)
  expect(await searchFound(page, `${baseFilter(skuA)}&&${field}:>110`, writeSeq)).toBe(0)
  expect(await searchFound(page, `${baseFilter(skuB)}&&${field}:>110`, writeSeq)).toBe(0)
})
