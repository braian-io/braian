import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row239-shots')
mkdirSync(shots, { recursive: true })

const WANTED = 'Hazelnut chocolate 439'

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

async function pickProduct(page: Page): Promise<{ id: string; key: string; name: string; brand: string }> {
  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })

  const visible = async (row: Locator) => row.isVisible().catch(() => false)
  let target: Locator | undefined

  const named = rows.filter({ has: page.locator('[data-column="name"]', { hasText: WANTED }) })
  for (let index = 0; index < (await named.count()); index += 1) {
    const row = named.nth(index)
    const text = ((await row.locator('[data-column="name"]').textContent()) ?? '').trim()
    if (text === WANTED && (await visible(row))) {
      target = row
      break
    }
  }

  if (!target) {
    const cheddar = rows.filter({ hasText: /PROD-CHEDDAR|Mature cheddar/ })
    for (let index = 0; index < (await cheddar.count()); index += 1) {
      const row = cheddar.nth(index)
      if (await visible(row)) {
        target = row
        break
      }
    }
  }

  if (!target) {
    for (let index = 0; index < (await rows.count()); index += 1) {
      const row = rows.nth(index)
      if (!(await visible(row))) continue
      const key = ((await row.locator('[data-column="key"]').textContent()) ?? '').trim()
      const name = ((await row.locator('[data-column="name"]').textContent()) ?? '').trim()
      if (key && name) {
        target = row
        break
      }
    }
  }

  if (!target) throw new Error('no product row in the Products table')

  const id = (await target.getAttribute('id'))?.replace(/^object-row-/, '')
  if (!id) throw new Error('product row has no object id')

  await target.click()
  await expect(target).toHaveAttribute('aria-selected', 'true')
  await page.locator('[data-view-type="object_detail"]').first().click()

  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()

  const name = ((await detail.locator('.detail-title strong').textContent()) ?? '').trim()
  const numberInput = fieldByLabel(page, detail, 'Number').locator('.control input').first()
  const brandInput = fieldByLabel(page, detail, 'Brand').locator('.control input').first()
  await expect(numberInput).toBeVisible()
  await expect(brandInput).toBeVisible()
  const key = await numberInput.inputValue()
  const brand = await brandInput.inputValue()

  return { id, key, name, brand }
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
