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
  const modelSeq = await saveModelDraft(page)
  await waitIndexed(page, modelSeq)

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

  const docA = await page.request.get(
    `/v1/search?q=*&filter=${encodeURIComponent(baseFilter(skuA))}&per_page=1&wait_seq=${writeSeq}`,
  )
  expect(docA.ok(), await docA.text()).toBeTruthy()
  const hitA = ((await docA.json()) as { hits?: Array<{ document?: Record<string, unknown> }> }).hits?.[0]
    ?.document
  expect(typeof hitA?.[field]).toBe('number')
  expect(hitA?.[field] as number).toBeGreaterThan(95)
  expect(hitA?.[field] as number).toBeLessThan(105)

  const docB = await page.request.get(
    `/v1/search?q=*&filter=${encodeURIComponent(baseFilter(skuB))}&per_page=1&wait_seq=${writeSeq}`,
  )
  expect(docB.ok(), await docB.text()).toBeTruthy()
  const hitB = ((await docB.json()) as { hits?: Array<{ document?: Record<string, unknown> }> }).hits?.[0]
    ?.document
  expect(typeof hitB?.[field]).toBe('number')
  expect(hitB?.[field] as number).toBeGreaterThan(95)
  expect(hitB?.[field] as number).toBeLessThan(105)

  expect(await searchFound(page, `${baseFilter(skuA)}&&${field}:>110`, writeSeq)).toBe(0)
  expect(await searchFound(page, `${baseFilter(skuB)}&&${field}:>110`, writeSeq)).toBe(0)
})