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

async function openTrashTable(page: Page) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('user-menu-trash').click()
  const table = page.getByTestId('trash-table-chrome')
  await expect(table).toBeVisible()
  return table
}

test('trash table restore and purge', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString().slice(-7)
  const number = `R227-${stamp}`
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  const created = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json() as { id: string }
  try {
    const deleted = await page.request.delete(`/v1/objects/${id}`)
    expect(deleted.ok()).toBeTruthy()
    const table = await openTrashTable(page)
    const row = table.locator('[data-testid="trash-row"]').filter({ hasText: number })
    await expect(row).toBeVisible()
    await expect(row.locator('[data-column="name"]')).toContainText(number)
    await expect(row.locator('[data-column="type"]')).toContainText('product')
    await row.click()
    await page.locator('.pane-tab[data-view-type="object_detail"]').first().click()
    await expect(page.getByTestId('object-detail')).toBeVisible()
    await expect(page.getByTestId('object-detail')).toContainText(number)
    await page.getByTestId('trash-detail-restore').click()
    await expect(row).toHaveCount(0)
    const live = await page.request.get(`/v1/objects/${id}`)
    expect(live.ok()).toBeTruthy()
    const deletedAgain = await page.request.delete(`/v1/objects/${id}`)
    expect(deletedAgain.ok()).toBeTruthy()
    await openTrashTable(page)
    const rowAgain = table.locator('[data-testid="trash-row"]').filter({ hasText: number })
    await expect(rowAgain).toBeVisible()
    await rowAgain.click({ button: 'right' })
    await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Delete permanently' }).click()
    const dialog = page.getByTestId('trash-purge-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(number)
    await dialog.getByTestId('confirm-trash-purge').click()
    await expect(dialog).toBeHidden()
    await expect(rowAgain).toHaveCount(0)
    const gone = await page.request.get(`/v1/objects/${id}`)
    expect(gone.status()).toBe(404)
  } finally {
    await page.request.delete(`/v1/objects/${id}`).catch(() => undefined)
  }
})