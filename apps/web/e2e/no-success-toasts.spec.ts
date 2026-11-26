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
  await expect(mainTable(page)).toBeVisible()
}

test.describe('no success toasts', () => {
  test('saving a product field shows inline feedback, not a toast', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await openProducts(page)
    const original = 'Mature cheddar'
    const edited = `No toast save ${Date.now().toString().slice(-5)}`
    const row = mainTable(page).getByTestId('object-row').filter({ hasText: original }).first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    const nameCell = row.locator('[data-column="name"]').first()
    await nameCell.dblclick()
    const editor = page.getByTestId('cell-editor-name')
    await expect(editor).toBeVisible()
    await editor.fill(edited)
    await editor.press('Enter')
    await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
    await mainTable(page).getByTestId('review-and-save').click()
    await expect(page.getByTestId('activity-log')).toContainText('Saved', { timeout: 30_000 })
    await expect(nameCell).toContainText(edited, { timeout: 30_000 })
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)

    await nameCell.dblclick()
    await page.getByTestId('cell-editor-name').fill(original)
    await page.getByTestId('cell-editor-name').press('Enter')
    await mainTable(page).getByTestId('review-and-save').click()
    await expect(nameCell).toContainText(original, { timeout: 30_000 })
  })

  test('creating an object closes the dialog without a success toast', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await openProducts(page)
    const number = `NT-${Date.now().toString().slice(-7)}`
    await mainTable(page).getByTestId('table-add-row').click()
    const dialog = page.getByTestId('create-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('new-number').fill(number)
    await dialog.getByTestId('new-name').fill(number)
    const created = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().includes('/v1/objects'))
    await dialog.getByTestId('create-object').click()
    expect((await created).ok()).toBeTruthy()
    await expect(dialog).toBeHidden()
    await expect(mainTable(page).getByTestId('object-row').filter({ hasText: number })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  })

  test('deleting an object closes the dialog without a success toast', async ({ page }) => {
    test.setTimeout(120_000)
    const number = `NT-DEL-${Date.now().toString().slice(-7)}`
    await login(page)
    const created = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'bread' },
        values: { number, name: { en: number }, status: 'draft' },
      },
    })
    expect(created.ok()).toBeTruthy()
    const { id } = (await created.json()) as { id: string }
    try {
    await openProducts(page)
    await mainTable(page).getByTestId('quick-filter').first().fill(number)
    const row = page.locator(`#object-row-${id}`)
    await expect(row).toBeVisible({ timeout: 60_000 })
    await row.click({ button: 'right' })
    const menu = page.getByTestId('context-menu')
    await menu.getByRole('menuitem', { name: /^Delete/ }).click()
    const dialog = page.getByTestId('delete-object-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('confirm-delete-object').click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(row).toHaveCount(0)
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
    } finally {
      await page.request.delete(`/v1/objects/${id}`).catch(() => undefined)
    }
  })
})