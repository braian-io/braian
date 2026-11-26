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

async function saveModelDraft(page: Page) {
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
  const body = (await saved.json()) as { seq?: number }
  return body.seq ?? 0
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

async function stageOperation(page: Page, operation: string, args: Record<string, unknown>) {
  const staged = await page.request.post('/v1/model/draft/steps', { data: { operation, args } })
  expect(staged.ok(), await staged.text()).toBeTruthy()
}

async function createUnit(
  page: Page,
  fields: { family: string; code: string; symbol: string; factor: string; offset: string; label: string },
) {
  const table = page.getByTestId('units-table')
  await table.getByTestId('table-add-row').click()
  const dialog = page.getByTestId('create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Enter a name.')).toHaveCount(0)
  await expect(dialog.getByText(/new family name creates the family/i)).toBeVisible()
  await dialog.getByTestId('new-name').fill(fields.family)
  await dialog.getByTestId('new-key').fill(fields.code)
  await dialog.getByTestId('new-symbol').fill(fields.symbol)
  await dialog.getByTestId('new-factor').fill(fields.factor)
  await dialog.getByTestId('new-offset').fill(fields.offset)
  await dialog.getByTestId('new-labels').fill(fields.label)
  await dialog.getByTestId('create-object').click()
  await expect(dialog).toHaveCount(0)
  await expect(table.locator(`[data-row-id="${fields.family}:${fields.code}"]`)).toBeVisible()
}

test('row307 new family from the unit dialog filters across an offset', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString(36)
  const familyKey = `row307_ui_${stamp}`
  const attributeKey = `row307_ui_reading_${stamp}`
  const skuA = `ROW307-UI-A-${stamp}`
  const skuB = `ROW307-UI-B-${stamp}`

  await login(page)
  await page.request.delete('/v1/model/draft').catch(() => {})
  await page.getByRole('button', { name: 'Data model' }).click()
  const tab = page.locator('.pane-tab').filter({ hasText: 'Units' }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  const table = page.getByTestId('units-table')
  await expect(table).toBeVisible()
  await expect(table.getByText('Labels', { exact: true })).toBeVisible()
  await expect(table.getByText('Symbol', { exact: true })).toBeVisible()
  await expect(table.getByText('Offset', { exact: true })).toBeVisible()

  await createUnit(page, {
    family: familyKey,
    code: 'C',
    symbol: '°C',
    factor: '1',
    offset: '0',
    label: 'Celsius',
  })
  await createUnit(page, {
    family: familyKey,
    code: 'F',
    symbol: '°F',
    factor: '5/9',
    offset: '-160/9',
    label: 'Fahrenheit',
  })

  const fahrenheit = table.locator(`[data-row-id="${familyKey}:F"]`)
  await fahrenheit.locator('[data-column="labels"]').dblclick()
  const editor = page.getByTestId('standard-cell-editor')
  await expect(editor).toBeVisible()
  await editor.fill('Fahrenheit scale')
  const committed = page.waitForResponse((response) =>
    response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
  await editor.press('Enter')
  const response = await committed
  expect(response.ok(), await response.text()).toBeTruthy()
  await expect(table.getByTestId('review-and-save')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
  await expect(fahrenheit.locator('[data-column="labels"]')).toContainText('Fahrenheit scale')

  const defsAfterUnits = (await (await page.request.get('/v1/definitions')).json()) as {
    unit_families?: Array<{ key?: string; units?: Array<{ code?: string; symbol?: string; labels?: { en?: string } }> }>
  }
  const family = defsAfterUnits.unit_families?.find((item) => item.key === familyKey)
  expect(family?.units?.map((unit) => unit.code)).toEqual(['C', 'F'])
  expect(family?.units?.find((unit) => unit.code === 'F')?.symbol).toBe('°F')
  expect(family?.units?.find((unit) => unit.code === 'F')?.labels?.en).toBe('Fahrenheit scale')

  await page.request.delete('/v1/model/draft').catch(() => {})
  await stageOperation(page, 'model.create_attribute', {
    key: attributeKey,
    label: `Row307 UI temperature ${stamp}`,
    kind: 'number',
    unit: familyKey,
    filterable: true,
    sortable: true,
    searchable: false,
  })
  await stageOperation(page, 'model.attach_attribute', {
    attribute: attributeKey,
    type_key: 'product',
  })
  const modelSeq = await saveModelDraft(page)
  await waitIndexed(page, modelSeq)

  const defs = (await (await page.request.get('/v1/definitions')).json()) as {
    attributes?: Array<{ id?: string; key?: string }>
  }
  const attribute = defs.attributes?.find((item) => item.key === attributeKey)
  expect(attribute?.id).toBeTruthy()
  const field = `a_${String(attribute?.id).replaceAll('-', '_')}`

  const createdA = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: {
        number: skuA,
        name: { en: `Row307 UI A ${stamp}` },
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
        name: { en: `Row307 UI B ${stamp}` },
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
