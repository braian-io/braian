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
}

async function stageOperation(page: Page, operation: string, args: Record<string, unknown>) {
  const staged = await page.request.post('/v1/model/draft/steps', { data: { operation, args } })
  expect(staged.ok(), await staged.text()).toBeTruthy()
}

type Definitions = {
  attributes?: Array<{ id?: string; key?: string }>
}

test('row307 temperature family filters match across celsius and fahrenheit', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString(36)
  const familyKey = `row307_temp_${stamp}`
  const attributeKey = `row307_reading_${stamp}`
  const skuA = `ROW307-A-${stamp}`
  const skuB = `ROW307-B-${stamp}`

  await login(page)
  await page.request.delete('/v1/model/draft').catch(() => {})

  await stageOperation(page, 'model.create_unit_family', {
    key: familyKey,
    dimension: 'temperature',
    base_unit: 'celsius',
    units: [
      { code: 'celsius', factor: '1', offset: '0', symbol: '°C' },
      {
        code: 'fahrenheit',
        factor: '0.555555555555555555555555556',
        offset: '-17.777777777777777777777777778',
        symbol: '°F',
      },
    ],
  })
  await stageOperation(page, 'model.create_attribute', {
    key: attributeKey,
    label: `Row307 temperature ${stamp}`,
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
  await saveModelDraft(page)

  const defs = (await (await page.request.get('/v1/definitions')).json()) as Definitions
  const attribute = defs.attributes?.find((item) => item.key === attributeKey)
  expect(attribute?.id).toBeTruthy()
  const field = `a_${String(attribute?.id).replaceAll('-', '_')}`

  const createdA = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: {
        number: skuA,
        name: { en: `Row307 A ${stamp}` },
        status: 'draft',
        [attributeKey]: { value: '100', unit: 'celsius' },
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
        name: { en: `Row307 B ${stamp}` },
        status: 'draft',
        [attributeKey]: { value: '212', unit: 'fahrenheit' },
      },
    },
  })
  expect(createdB.ok(), await createdB.text()).toBeTruthy()

  await expect.poll(async () => {
    const response = await page.request.get(
      `/v1/search?q=*&filter=type_key:=product&&${field}:>50&per_page=50`,
    )
    if (!response.ok()) return 0
    const body = (await response.json()) as { found?: number; hits?: Array<{ document?: { key?: string } }> }
    const keys = (body.hits ?? []).map((hit) => hit.document?.key).filter(Boolean)
    return keys.includes(skuA) && keys.includes(skuB) ? 2 : 0
  }, { timeout: 90_000 }).toBe(2)

  const narrow = await page.request.get(
    `/v1/search?q=*&filter=type_key:=product&&${field}:>150&per_page=50`,
  )
  expect(narrow.ok()).toBeTruthy()
  const narrowBody = (await narrow.json()) as { hits?: Array<{ document?: { key?: string } }> }
  const narrowKeys = (narrowBody.hits ?? []).map((hit) => hit.document?.key)
  expect(narrowKeys).not.toContain(skuA)
  expect(narrowKeys).not.toContain(skuB)
})