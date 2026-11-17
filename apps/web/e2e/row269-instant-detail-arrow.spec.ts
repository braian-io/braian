import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  const grid = table.locator('.grid').first()
  await grid.focus()
  return { table, rows, grid }
}

function objectReads(url: string) {
  const pathname = new URL(url).pathname
  return pathname.startsWith('/v1/objects/') && !pathname.includes(':pathValues')
}

async function detailTitle(page: Page) {
  const detail = page.getByTestId('object-detail')
  return (await detail.locator('.detail-title strong').innerText()).trim()
}

test('arrowing through rows keeps Detail visible without a loading screen', async ({ page }) => {
  test.setTimeout(120_000)
  const { rows } = await openProducts(page)
  await expect(page.getByTestId('detail-empty')).toBeVisible()

  for (let step = 0; step < 6; step += 1) {
    const row = rows.nth(step)
    const name = (await row.locator('[data-column="name"]').innerText()).trim()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('object-detail')).toBeVisible()
    await expect(page.getByTestId('detail-loading')).toHaveCount(0)
    await expect(page.getByTestId('state-loading')).toHaveCount(0)
    await expect.poll(() => detailTitle(page)).toBe(name)
  }
})

test('rapid Down arrows bound object GETs and show preview skeletons before the body loads', async ({ page }) => {
  test.setTimeout(120_000)
  const { rows } = await openProducts(page)
  const gets: string[] = []
  await page.route('**/v1/objects/**', async (route) => {
    if (route.request().method() === 'GET' && objectReads(route.request().url())) gets.push(route.request().url())
    await route.continue()
  })

  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')
  gets.length = 0

  for (let step = 0; step < 24; step += 1) await page.keyboard.press('ArrowDown', { delay: 25 })
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  expect(gets.length).toBeGreaterThan(0)
  expect(gets.length).toBeLessThan(48)

  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect(page.getByTestId('object-detail')).toHaveAttribute('data-detail-ready', 'false')
  await expect.poll(async () => page.getByTestId('detail-field-skeleton').count()).toBeGreaterThan(0)
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')
  await expect(page.getByTestId('detail-field-skeleton')).toHaveCount(0)

  const lastIndex = await rows.count() - 1
  await page.keyboard.press('End')
  await expect.poll(async () => (await rows.nth(lastIndex).getAttribute('aria-selected')) === 'true').toBe(true)
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  await page.keyboard.press('PageDown')
  await expect.poll(async () => (await rows.nth(lastIndex).getAttribute('aria-selected')) === 'true').toBe(true)
})

test('Save stays off while Detail is still on the list preview', async ({ page }) => {
  test.setTimeout(120_000)
  await openProducts(page)
  await page.keyboard.press('ArrowDown')
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  await expect(detail).toHaveAttribute('data-detail-ready', 'false')
  await expect(detail.getByTestId('delete-object-detail')).toBeDisabled()
  await expect.poll(async () => detail.getAttribute('data-detail-ready')).toBe('true')
  await expect(detail.getByTestId('delete-object-detail')).toBeEnabled()
})

test('a persistent object GET failure shows Retry without endless requests', async ({ page }) => {
  test.setTimeout(120_000)
  const { rows } = await openProducts(page)
  let fail = true
  const gets: string[] = []
  await page.route('**/v1/objects/**', async (route) => {
    const url = route.request().url()
    if (route.request().method() !== 'GET' || !objectReads(url)) {
      await route.continue()
      return
    }
    gets.push(url)
    if (fail) {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced load failure' }) })
      return
    }
    await route.continue()
  })

  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('detail-error')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('detail-field-skeleton')).toHaveCount(0)
  await expect(page.getByTestId('detail-fetch-retry')).toBeVisible()
  await page.waitForTimeout(2_000)
  const afterFailure = gets.length
  expect(afterFailure).toBeLessThanOrEqual(6)
  await page.waitForTimeout(2_000)
  expect(gets.length).toBe(afterFailure)

  fail = false
  await page.getByTestId('detail-fetch-retry').click()
  await expect(page.getByTestId('object-detail')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('detail-error')).toHaveCount(0)
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  gets.length = 0
  fail = true
  await page.keyboard.press('ArrowDown')
  const nextName = (await rows.nth(1).locator('[data-column="name"]').innerText()).trim()
  await expect.poll(() => detailTitle(page)).toBe(nextName)
  await expect(page.getByTestId('detail-error')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
  expect(gets.length).toBeLessThanOrEqual(6)
})

test('Enter and Space still confirm the focused row for Detail', async ({ page }) => {
  test.setTimeout(120_000)
  const { rows } = await openProducts(page)
  const first = rows.first()
  const second = rows.nth(1)
  const firstKey = (await first.locator('[data-column="number"], [data-column="key"]').first().innerText()).trim()
  const secondKey = (await second.locator('[data-column="number"], [data-column="key"]').first().innerText()).trim()
  const firstName = (await first.locator('[data-column="name"]').innerText()).trim()
  const secondName = (await second.locator('[data-column="name"]').innerText()).trim()

  await page.keyboard.press('ArrowDown')
  await expect.poll(() => detailTitle(page)).toBe(firstName)
  await page.keyboard.press('Space')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => new URL(page.url()).searchParams.get('object')).toBe(firstKey)
  await expect.poll(() => detailTitle(page)).toBe(firstName)

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => new URL(page.url()).searchParams.get('object')).toBe(secondKey)
  await expect.poll(() => detailTitle(page)).toBe(secondName)
})