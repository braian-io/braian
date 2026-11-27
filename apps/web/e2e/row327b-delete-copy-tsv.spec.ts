import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
}

function products(page: Page) {
  return mainTable(page)
}

function rows(page: Page) {
  return products(page).getByTestId('object-row')
}

async function openProducts(page: Page) {
  await login(page)
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  return products(page)
}

type Created = { id: string }

async function createProduct(page: Page, number: string): Promise<Created> {
  const response = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(response.ok(), `create product ${response.status()} ${await response.text()}`).toBeTruthy()
  return await response.json() as Created
}

test('multi-delete from the bar can cancel or confirm and clears the selection', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString().slice(-7)
  const first = await createProduct(page, `R327B-A-${stamp}`)
  const second = await createProduct(page, `R327B-B-${stamp}`)
  const table = await openProducts(page)
  const filter = table.getByTestId('quick-filter')
  await filter.fill(`R327B-`)
  await expect(rows(page)).toHaveCount(2, { timeout: 60_000 })

  const list = rows(page)
  await list.nth(0).click()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await expect(table.getByTestId('table-selection-bar')).toBeVisible()
  await table.getByTestId('table-selection-delete').click()
  await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
  await expect(page.getByTestId('delete-object-counts')).toContainText('2 objects')
  await page.getByTestId('cancel-delete-object').click()
  await expect(page.getByTestId('delete-object-dialog')).toHaveCount(0)
  await expect(list.nth(0)).toHaveAttribute('aria-selected', 'true')
  await expect(list.nth(1)).toHaveAttribute('aria-selected', 'true')

  await table.getByTestId('table-selection-delete').click()
  await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
  await page.getByTestId('confirm-delete-object').click()
  await expect(page.getByTestId('delete-object-dialog')).toHaveCount(0, { timeout: 60_000 })
  await expect(table.getByTestId('table-selection-bar')).toHaveCount(0)
  await expect(page.locator(`#object-row-${first.id}`)).toHaveCount(0)
  await expect(page.locator(`#object-row-${second.id}`)).toHaveCount(0)
})

test('copy as table text from the bar and row menu writes TSV', async ({ page }) => {
  test.setTimeout(120_000)
  const table = await openProducts(page)
  const list = rows(page)
  await list.nth(0).click()
  await list.nth(2).click({ modifiers: ['Shift'] })
  await expect(table.getByTestId('table-selection-bar')).toBeVisible()

  const names = await Promise.all([0, 1, 2].map(async (index) =>
    (await list.nth(index).locator('[data-column="name"]').innerText()).trim(),
  ))
  const numbers = await Promise.all([0, 1, 2].map(async (index) =>
    (await list.nth(index).locator('[data-column="number"]').innerText()).trim(),
  ))

  await table.getByTestId('table-selection-copy').click()
  const barCopy = await page.evaluate(() => navigator.clipboard.readText())
  expect(barCopy.split('\n')[0]).toContain('Number')
  expect(barCopy.split('\n')[0]).toContain('Name')
  expect(barCopy).toBe(
    `${barCopy.split('\n')[0]}\n${numbers[0]}\t${names[0]}\n${numbers[1]}\t${names[1]}\n${numbers[2]}\t${names[2]}\n`,
  )

  await list.nth(1).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy as table text' }).click()
  const menuCopy = await page.evaluate(() => navigator.clipboard.readText())
  expect(menuCopy).toBe(barCopy)
})