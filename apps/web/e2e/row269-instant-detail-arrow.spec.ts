import { expect, test, type Browser, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import {
  ROW269_E2E_PREFETCH_WITH_DEBOUNCE_MAX,
  ROW269_GET_BUDGET_MAX,
  ROW269_MEASURED_WITH_DEBOUNCE,
  ROW269_PREFETCH_SCHEDULED_WITHOUT_DEBOUNCE_MIN,
  ROW269_RAPID_ARROWS,
} from '../src/object-nav-get-budget.harness'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

type NavBudgetMetrics = { httpGets: number; prefetchScheduled: number; prefetchBatches: number }

async function openProducts(page: Page, options?: { disableDebounce?: boolean; trackPrefetch?: boolean }) {
  const disableDebounce = options?.disableDebounce ?? false
  const trackPrefetch = options?.trackPrefetch ?? false
  if (disableDebounce || trackPrefetch) {
    await page.addInitScript(
      ({ off, track }: { off: boolean; track: boolean }) => {
        if (off) window.__BRAIAN_DISABLE_OBJECT_NAV_DEBOUNCE__ = true
        if (track) {
          window.__BRAIAN_TRACK_OBJECT_NAV_PREFETCH__ = true
          window.__BRAIAN_NAV_PREFETCH_BATCHES__ = 0
          window.__BRAIAN_NAV_PREFETCH_SCHEDULED__ = 0
        }
      },
      { off: disableDebounce, track: trackPrefetch },
    )
  }
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  const grid = table.locator('.grid').first()
  await grid.focus()
  return { table, rows, grid }
}

async function focusProductsGrid(page: Page) {
  const table = mainTable(page)
  const grid = table.locator('.grid').first()
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await grid.focus()
  return table
}

function objectReads(url: string) {
  const pathname = new URL(url).pathname
  return pathname.startsWith('/v1/objects/') && !pathname.includes(':pathValues')
}

function objectIdFromRead(url: string) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\/v1\/objects\//, ''))
}

function rowObjectId(rowId: string | null) {
  return (rowId ?? '').replace(/^object-row-/, '')
}

async function detailTitle(page: Page) {
  const detail = page.getByTestId('object-detail')
  return (await detail.locator('.detail-title strong').innerText()).trim()
}

async function countRapidDownNavBudget(page: Page, disableDebounce: boolean): Promise<NavBudgetMetrics> {
  await openProducts(page, { disableDebounce, trackPrefetch: true })
  const gets: string[] = []
  await page.route('**/v1/objects/**', async (route) => {
    if (route.request().method() === 'GET' && objectReads(route.request().url())) gets.push(route.request().url())
    await route.continue()
  })
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')
  gets.length = 0
  await page.evaluate(() => {
    window.__BRAIAN_NAV_PREFETCH_BATCHES__ = 0
    window.__BRAIAN_NAV_PREFETCH_SCHEDULED__ = 0
  })
  for (let step = 0; step < ROW269_RAPID_ARROWS; step += 1) await page.keyboard.press('ArrowDown', { delay: 25 })
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')
  const prefetch = await page.evaluate(() => ({
    prefetchBatches: window.__BRAIAN_NAV_PREFETCH_BATCHES__ ?? 0,
    prefetchScheduled: window.__BRAIAN_NAV_PREFETCH_SCHEDULED__ ?? 0,
  }))
  return { httpGets: gets.length, ...prefetch }
}

async function withFreshPage(browser: Browser, disableDebounce: boolean) {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    return await countRapidDownNavBudget(page, disableDebounce)
  } finally {
    await context.close()
  }
}

function selectedRow(table: ReturnType<typeof mainTable>) {
  return table.getByTestId('object-row').and(table.locator('[aria-selected="true"]'))
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

test('debounce lowers rapid-arrow object GET count', async ({ browser }) => {
  test.setTimeout(240_000)
  const withDebounce = await withFreshPage(browser, false)
  const withoutDebounce = await withFreshPage(browser, true)
  expect(withDebounce.httpGets).toBe(ROW269_MEASURED_WITH_DEBOUNCE)
  expect(withDebounce.httpGets).toBeLessThan(ROW269_GET_BUDGET_MAX)
  expect(withDebounce.prefetchScheduled).toBeLessThanOrEqual(ROW269_E2E_PREFETCH_WITH_DEBOUNCE_MAX)
  expect(withoutDebounce.prefetchScheduled).toBeGreaterThanOrEqual(ROW269_PREFETCH_SCHEDULED_WITHOUT_DEBOUNCE_MIN)
  expect(withDebounce.prefetchScheduled).toBeLessThan(withoutDebounce.prefetchScheduled)
  expect(withDebounce.prefetchBatches).toBeLessThan(withoutDebounce.prefetchBatches)
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

  for (let step = 0; step < ROW269_RAPID_ARROWS; step += 1) await page.keyboard.press('ArrowDown', { delay: 25 })
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  expect(gets.length).toBeGreaterThan(0)
  expect(gets.length).toBeLessThan(ROW269_GET_BUDGET_MAX)

  let slowLoads = false
  await page.unroute('**/v1/objects/**')
  await page.route('**/v1/objects/**', async (route) => {
    if (route.request().method() === 'GET' && objectReads(route.request().url()) && slowLoads) {
      await page.waitForTimeout(1_500)
    }
    await route.continue()
  })

  slowLoads = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const tableAfterReload = await focusProductsGrid(page)
  const rowsAfterReload = tableAfterReload.getByTestId('object-row')
  await page.keyboard.press('ArrowDown')
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  await expect.poll(async () => detail.getAttribute('data-detail-ready')).toBe('false', { timeout: 30_000 })
  await expect(detail.getByTestId('delete-object-detail')).toBeDisabled()
  await expect.poll(async () => detail.getAttribute('data-detail-ready')).toBe('true', { timeout: 30_000 })
  await expect(detail.getByTestId('delete-object-detail')).toBeEnabled()
  slowLoads = false

  const lastIndex = await rowsAfterReload.count() - 1
  await page.keyboard.press('End')
  await expect.poll(async () => (await rowsAfterReload.nth(lastIndex).getAttribute('aria-selected')) === 'true').toBe(true)
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  await page.keyboard.press('PageDown')
  await expect.poll(async () => (await rowsAfterReload.nth(lastIndex).getAttribute('aria-selected')) === 'true').toBe(true)
})

test('a persistent object GET failure shows Retry without endless requests', async ({ page }) => {
  test.setTimeout(120_000)
  const { rows, table } = await openProducts(page)
  let fail = true
  let anchoredObjectId = ''
  const failIds = new Set<string>()
  const failedGets: string[] = []
  await page.route('**/v1/objects/**', async (route) => {
    const url = route.request().url()
    if (route.request().method() !== 'GET' || !objectReads(url)) {
      await route.continue()
      return
    }
    const id = objectIdFromRead(url)
    const shouldFail =
      fail &&
      (failIds.has(id) || (anchoredObjectId && failIds.size === 0 && id !== anchoredObjectId))
    if (shouldFail) {
      failIds.add(id)
      failedGets.push(url)
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced load failure' }) })
      return
    }
    await route.continue()
  })

  failIds.add(rowObjectId(await rows.first().getAttribute('id')))
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('detail-error')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('detail-field-skeleton')).toHaveCount(0)
  await expect(page.getByTestId('detail-fetch-retry')).toBeVisible()
  await page.waitForTimeout(2_000)
  const afterFailure = failedGets.length
  expect(afterFailure).toBeLessThanOrEqual(6)
  await page.waitForTimeout(2_000)
  expect(failedGets.length).toBe(afterFailure)

  fail = false
  await page.getByTestId('detail-fetch-retry').click()
  await expect(page.getByTestId('object-detail')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('detail-error')).toHaveCount(0)
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  failedGets.length = 0
  fail = true
  failIds.clear()
  anchoredObjectId = rowObjectId(await selectedRow(table).getAttribute('id'))
  const titleBeforeMove = await detailTitle(page)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => detailTitle(page)).not.toBe(titleBeforeMove)
  await expect(page.getByTestId('detail-error')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
  expect(failedGets.length).toBeLessThanOrEqual(6)
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