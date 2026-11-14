import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row239-shots')
mkdirSync(shots, { recursive: true })

const WANTED = 'Hazelnut chocolate 439'

type SearchDoc = Record<string, unknown>
type SearchHit = { id?: string; key?: string; document?: SearchDoc }

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('braian.theme', JSON.stringify('dark'))
  })
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openProducts(page: Page) {
  const tab = page.locator('nav.tabs').getByRole('button', { name: /^Products/ })
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  await expect(mainTable(page)).toBeVisible()
}

async function searchProducts(
  page: Page,
  query: string,
): Promise<Array<{ id: string; document: SearchDoc }>> {
  const response = await page.request.get(
    `/v1/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent('type_key:=product')}&lang=en&sort=a_number&per_page=100`,
  )
  if (!response.ok()) return []
  const body = (await response.json()) as { hits?: SearchHit[] }
  return (body.hits ?? [])
    .map((hit) => {
      const document = (hit.document ?? hit) as SearchDoc
      return { id: String(hit.id ?? document.id ?? ''), document }
    })
    .filter((hit) => hit.id)
}

async function pickProduct(page: Page): Promise<{ id: string; key: string; name: string; brand: string }> {
  const found = [...(await searchProducts(page, 'Hazelnut chocolate')), ...(await searchProducts(page, '*'))]
  const unique = new Map<string, { id: string; document: SearchDoc }>()
  for (const hit of found) unique.set(hit.id, hit)
  const docs = [...unique.values()]
  const nameOf = (doc: SearchDoc) => String(doc.a_name__en ?? doc.display_name ?? '')
  const brandOf = (doc: SearchDoc) => String(doc.a_brand ?? doc.brand ?? '')
  const keyOf = (doc: SearchDoc) => String(doc.key ?? doc.a_number ?? '')
  const ranked = [
    ...docs.filter((hit) => nameOf(hit.document) === WANTED),
    ...docs.filter((hit) => nameOf(hit.document).length >= 16 && brandOf(hit.document)),
    ...docs.filter((hit) => keyOf(hit.document) && nameOf(hit.document) && brandOf(hit.document)),
    ...docs,
  ]
  const seen = new Set<string>()
  for (const hit of ranked) {
    if (seen.has(hit.id)) continue
    seen.add(hit.id)
    const loaded = await page.request.get(`/v1/objects/${hit.id}`)
    if (!loaded.ok()) continue
    const object = (await loaded.json()) as {
      values?: { number?: string; brand?: string; name?: Record<string, string> }
    }
    const name = object.values?.name?.en ?? nameOf(hit.document)
    const brand = object.values?.brand ?? brandOf(hit.document)
    const number = object.values?.number ?? keyOf(hit.document)
    if (!name || !brand || !number) continue
    return { id: hit.id, key: number, name, brand }
  }
  throw new Error('no product with a readable name and brand')
}

function productsPane(page: Page): Locator {
  return page
    .locator('section.pane')
    .filter({ has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }) })
    .first()
}

function fieldByLabel(page: Page, detail: Locator, label: string): Locator {
  return detail
    .locator('.field')
    .filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) })
    .first()
}

async function expectReadableDetail(
  page: Page,
  detail: Locator,
  expected: { name: string; key: string; brand: string },
) {
  const title = detail.locator('.detail-title strong')
  await expect(title).toHaveText(expected.name)
  expect(await title.getAttribute('title'), 'title tooltip carries the full name').toBe(expected.name)
  const titleMetrics = await title.evaluate((node) => ({
    scroll: node.scrollWidth,
    client: node.clientWidth,
  }))
  expect(titleMetrics.scroll, 'title is not clipped horizontally').toBeLessThanOrEqual(titleMetrics.client + 2)

  const numberField = fieldByLabel(page, detail, 'Number')
  const numberInput = numberField.locator('.control input').first()
  await expect(numberInput).toHaveValue(expected.key)
  expect(await numberInput.getAttribute('title'), 'Number tooltip carries the full value').toBe(expected.key)
  expect((await numberInput.boundingBox())?.width ?? 0, 'Number value is wider than one letter').toBeGreaterThan(80)

  const brandField = fieldByLabel(page, detail, 'Brand')
  const brandInput = brandField.locator('.control input').first()
  await expect(brandInput).toHaveValue(expected.brand)
  expect(await brandInput.getAttribute('title'), 'Brand tooltip carries the full value').toBe(expected.brand)
  expect((await brandInput.boundingBox())?.width ?? 0, 'Brand value is wider than one letter').toBeGreaterThan(80)

  const nameField = fieldByLabel(page, detail, 'Name')
  const nameInput = nameField.locator('.lang-row input').first()
  await expect(nameField.locator('.lang-tag').first()).toHaveText('en')
  await expect(nameInput).toHaveValue(expected.name)
  expect(await nameInput.getAttribute('title'), 'localized Name tooltip carries the full value').toBe(expected.name)
  expect((await nameInput.boundingBox())?.width ?? 0, 'localized Name keeps room beside the tag').toBeGreaterThan(120)

  const measure = detail.locator('.measure input').first()
  await expect(measure).toBeVisible()
  expect((await measure.boundingBox())?.width ?? 0, 'measure input grows past 88px').toBeGreaterThan(88)
}

async function expectUsableTable(page: Page, rowId: string, name: string, floor: number) {
  const pane = productsPane(page)
  await expect(pane).toBeVisible()
  const paneBox = await pane.boundingBox()
  expect(paneBox?.width ?? 0, 'table pane keeps a usable minimum width').toBeGreaterThanOrEqual(floor)

  const nameCell = page.locator(`[id="object-row-${rowId}"] [data-column="name"]`)
  await expect(nameCell).toBeVisible()
  await expect(nameCell).toHaveText(name)
  const cellBox = await nameCell.boundingBox()
  const visible =
    Math.min(cellBox!.x + cellBox!.width, paneBox!.x + paneBox!.width) - Math.max(cellBox!.x, paneBox!.x)
  expect(visible, 'Name column is readable beside Detail').toBeGreaterThan(100)
}

test('Detail and the Products table keep their width, titles, values and measure field (row 239)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  await openProducts(page)

  const product = await pickProduct(page)
  const table = mainTable(page)
  const filter = table.getByTestId('quick-filter').first()
  if ((await filter.inputValue()) !== '') await filter.fill('')
  const search = page.waitForResponse(
    (response) => response.url().includes('/v1/search') && response.url().includes(encodeURIComponent(product.key)) && response.ok(),
  )
  await filter.fill(product.key)
  await search
  const row = page.locator(`[id="object-row-${product.id}"]`)
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await page.locator('[data-view-type="object_detail"]').first().click()

  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  await expect(detail.locator('.detail-title strong')).toHaveText(product.name)

  await expectUsableTable(page, product.id, product.name, 400)
  await setTheme(page, 'dark')
  await expectReadableDetail(page, detail, product)
  await page.screenshot({ path: `${shots}/detail-dark.png`, fullPage: true })

  await setTheme(page, 'light')
  await expectReadableDetail(page, detail, product)
  await page.screenshot({ path: `${shots}/detail-light.png`, fullPage: true })

  // A narrow window still leaves the table above one column. The Detail pane
  // gives way and stacks its labels instead of squeezing values to one letter.
  await page.setViewportSize({ width: 900, height: 700 })
  await expectUsableTable(page, product.id, product.name, 420)
  await expectReadableDetail(page, detail, product)
})
