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

test('rapid Down arrows show preview skeletons before the body loads', async ({ page }) => {
  test.setTimeout(120_000)
  await openProducts(page)

  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  for (let step = 0; step < 24; step += 1) await page.keyboard.press('ArrowDown', { delay: 25 })
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  let slowLoads = false
  let releaseSlowObject: (() => void) | undefined
  await page.route('**/v1/objects/**', async (route) => {
    if (route.request().method() === 'GET' && objectReads(route.request().url()) && slowLoads) {
      await new Promise<void>((resolve) => {
        releaseSlowObject = resolve
      })
    }
    await route.continue()
  })

  slowLoads = true
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const tableAfterReload = await focusProductsGrid(page)
  await page.keyboard.press('ArrowDown')
  const detail = page.getByTestId('object-detail')
  const row = selectedRow(tableAfterReload)
  const rowName = (await row.locator('[data-column="name"]').innerText()).trim()
  await expect(detail).toBeVisible()
  await expect.poll(() => detailTitle(page)).toBe(rowName)
  await expect(detail.getByTestId('state-loading')).toHaveCount(0)
  await expect.poll(async () => detail.getAttribute('data-detail-ready'), { timeout: 30_000 }).toBe('false')
  // `description` is on the product type and is not part of the list-row preview.
  await expect.poll(async () => detail.locator('[data-testid="detail-field-skeleton"][data-field="description"]').count()).toBeGreaterThan(0)
  await expect(detail.getByTestId('delete-object-detail')).toBeDisabled()
  releaseSlowObject?.()
  await expect.poll(async () => detail.getAttribute('data-detail-ready'), { timeout: 30_000 }).toBe('true')
  await expect(detail.getByTestId('delete-object-detail')).toBeEnabled()
  await expect(detail.getByTestId('detail-field-skeleton')).toHaveCount(0)
  slowLoads = false

  await page.keyboard.press('End')
  const endRow = selectedRow(tableAfterReload)
  const endRowId = await endRow.getAttribute('id')
  const objectParamBefore = new URL(page.url()).searchParams.get('object')
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')
  await page.keyboard.press('PageDown')
  await expect.poll(async () => endRow.getAttribute('id')).toBe(endRowId)
  await expect.poll(() => new URL(page.url()).searchParams.get('object')).toBe(objectParamBefore)
})

test('a persistent object GET failure shows Retry without endless requests', async ({ page }) => {
  test.setTimeout(120_000)
  const { rows, table } = await openProducts(page)
  let passId = ''
  const failedGets: string[] = []
  await page.route('**/v1/objects/**', async (route) => {
    const url = route.request().url()
    if (route.request().method() !== 'GET' || !objectReads(url)) {
      await route.continue()
      return
    }
    const id = objectIdFromRead(url)
    if (passId && id === passId) {
      await route.continue()
      return
    }
    failedGets.push(url)
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced load failure' }) })
  })

  const firstId = rowObjectId(await rows.first().getAttribute('id'))
  const failuresFor = (id: string) => failedGets.filter((url) => objectIdFromRead(url) === id).length
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('detail-error')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('detail-field-skeleton')).toHaveCount(0)
  await expect(page.getByTestId('detail-fetch-retry')).toBeVisible()
  await page.waitForTimeout(2_000)
  const afterFailure = failuresFor(firstId)
  expect(afterFailure).toBeLessThanOrEqual(6)
  await page.waitForTimeout(2_000)
  expect(failuresFor(firstId)).toBe(afterFailure)

  passId = firstId
  await page.getByTestId('detail-fetch-retry').click()
  await expect(page.getByTestId('object-detail')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('detail-error')).toHaveCount(0)
  await expect.poll(async () => page.getByTestId('object-detail').getAttribute('data-detail-ready')).toBe('true')

  const anchoredObjectId = rowObjectId(await selectedRow(table).getAttribute('id'))
  const failedBeforeMove = failedGets.length
  await focusProductsGrid(page)
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => rowObjectId(await selectedRow(table).getAttribute('id'))).not.toBe(anchoredObjectId)
  const nextId = rowObjectId(await selectedRow(table).getAttribute('id'))
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('detail-error')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
  const nextFailures = failedGets.slice(failedBeforeMove).filter((url) => objectIdFromRead(url) === nextId).length
  expect(nextFailures).toBeLessThanOrEqual(6)
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