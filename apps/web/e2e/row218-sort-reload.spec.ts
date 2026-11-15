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
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  await expect(table).toBeVisible()
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(table.getByTestId('column-prefs-skeleton')).toHaveCount(0)
  return table
}

async function reloadProducts(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  await expect(table).toBeVisible()
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(table.getByTestId('column-prefs-skeleton')).toHaveCount(0)
  return table
}

function nameHeader(table: ReturnType<typeof mainTable>) {
  return table.locator('.head [data-testid="col-name"]').first()
}

async function firstName(table: ReturnType<typeof mainTable>) {
  return table.getByTestId('object-row').first().locator('[data-column="name"]').innerText()
}

async function waitForViewSortSave(page: Page) {
  const response = await page.waitForResponse(
    (item) =>
      item.request().method() === 'POST'
      && item.url().includes('/v1/views')
      && !item.url().includes('column-prefs')
      && item.ok(),
    { timeout: 30_000 },
  )
  const body = response.request().postDataJSON() as { state?: { table?: { sort?: string } } }
  return body.state?.table?.sort ?? ''
}

async function setNameSort(table: ReturnType<typeof mainTable>, direction: 'ascending' | 'descending' | 'none') {
  const header = nameHeader(table)
  await expect(header).toBeVisible()
  const button = header.locator('button.column-header-btn')
  const target =
    direction === 'ascending' ? 'ascending' : direction === 'descending' ? 'descending' : 'none'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await header.getAttribute('aria-sort')
    if (current === target) return
    await button.click()
  }
  await expect(header).toHaveAttribute('aria-sort', target)
}

test.describe('row 218 — sort arrow survives reload', () => {
  test('ascending name sort keeps the header arrow after reload', async ({ page }) => {
    await login(page)
    const table = await openProducts(page)
    await setNameSort(table, 'ascending')
    await waitForViewSortSave(page)

    const before = await firstName(table)
    const reloaded = await reloadProducts(page)
    await expect(nameHeader(reloaded)).toHaveAttribute('aria-sort', 'ascending')
    await expect(await firstName(reloaded)).toBe(before)

    await setNameSort(reloaded, 'none')
    await waitForViewSortSave(page)
  })

  test('descending name sort keeps the header arrow after reload', async ({ page }) => {
    await login(page)
    const table = await openProducts(page)
    await setNameSort(table, 'descending')
    await waitForViewSortSave(page)

    const before = await firstName(table)
    const reloaded = await reloadProducts(page)
    await expect(nameHeader(reloaded)).toHaveAttribute('aria-sort', 'descending')
    await expect(await firstName(reloaded)).toBe(before)

    await setNameSort(reloaded, 'none')
    await waitForViewSortSave(page)
  })

  test('cleared sort shows no arrow after reload', async ({ page }) => {
    await login(page)
    const table = await openProducts(page)
    await setNameSort(table, 'ascending')
    await waitForViewSortSave(page)
    await setNameSort(table, 'none')
    await waitForViewSortSave(page)

    const reloaded = await reloadProducts(page)
    await expect(nameHeader(reloaded)).toHaveAttribute('aria-sort', 'none')
    const number = reloaded.locator('.head [data-testid="col-number"], .head [data-testid="col-key"]').first()
    await expect(number).toHaveAttribute('aria-sort', 'none')
  })
})