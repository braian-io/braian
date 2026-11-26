import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

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

async function expectNoFloatingNotice(page: Page) {
  await expect(page.locator('[data-testid="inline-action-notice"]')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
}

function rowByName(page: Page, name: RegExp | string) {
  return mainTable(page).getByTestId('object-row').filter({ hasText: name }).first()
}

test.describe('no success toasts', () => {
  test('saving a product field shows inline feedback, not a toast', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await openProducts(page)
    const original = 'Mature cheddar'
    const edited = `No toast save ${Date.now().toString().slice(-5)}`
    const row = rowByName(page, original)
    await expect(row).toBeVisible({ timeout: 60_000 })
    const rowId = await row.getAttribute('id')
    expect(rowId).toMatch(/^object-row-/)
    const stableRow = page.locator(`[id="${rowId}"]`)
    const nameCell = stableRow.locator('[data-column="name"]').first()

    try {
      await nameCell.dblclick()
      const editor = page.getByTestId('cell-editor-name')
      await expect(editor).toBeVisible()
      await editor.fill(edited)
      await editor.press('Enter')
      await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
      await mainTable(page).getByTestId('review-and-save').click()
      await expect(page.getByTestId('activity-log')).toContainText('Saved', { timeout: 30_000 })
      await expect
        .poll(async () => (await rowByName(page, edited).locator('[data-column="name"]').textContent())?.trim() ?? '', {
          timeout: 30_000,
        })
        .toBe(edited)
      await expectNoFloatingNotice(page)
    } finally {
      const current = rowByName(page, new RegExp(`${original}|${edited}`))
      if (await current.count()) {
        const shown = (await current.locator('[data-column="name"]').textContent())?.trim() ?? ''
        if (shown !== original) {
          await current.locator('[data-column="name"]').first().dblclick()
          const editor = page.getByTestId('cell-editor-name')
          await expect(editor).toBeVisible()
          await editor.fill(original)
          await editor.press('Enter')
          await mainTable(page).getByTestId('review-and-save').click()
          await expect
            .poll(async () => (await rowByName(page, original).locator('[data-column="name"]').textContent())?.trim() ?? '', {
              timeout: 30_000,
            })
            .toBe(original)
        }
      }
    }
  })

  test('creating an object closes the dialog without a success toast', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await openProducts(page)
    const number = `NT-${Date.now().toString().slice(-7)}`
    await mainTable(page).getByTestId('table-add-row').click()
    const dialog = page.getByTestId('new-object')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('new-number').fill(number)
    await dialog.getByTestId('new-name').fill(number)
    const created = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().includes('/v1/objects'))
    await dialog.getByTestId('create-object').click()
    expect((await created).ok()).toBeTruthy()
    await expect(dialog).toBeHidden()
    await expect(mainTable(page).getByTestId('object-row').filter({ hasText: number })).toBeVisible({ timeout: 60_000 })
    await expectNoFloatingNotice(page)
  })

  test('linking shows in-pane feedback without a floating notice', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await page.locator('nav.tabs').getByRole('button', { name: /^Articles/ }).click()
    const articles = mainTable(page, 'Articles')
    await expect(articles.getByTestId('object-row').first()).toBeVisible()
    const article = articles.getByTestId('object-row').filter({ hasText: 'ART-OAT-1L' }).first()
    const productsPane = paneWithTab(page, 'Products')
    const show = productsPane.getByTestId('peer-show-all')
    if (await show.isVisible()) await show.click()
    const products = mainTable(page, 'Products')
    await expect(products.getByTestId('object-row').first()).toBeVisible()
    const product = products.getByTestId('object-row').filter({ hasText: 'PROD-COFFEE' }).first()
    await article.dragTo(product)
    const dialog = page.getByTestId('link-create-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('link-create-confirm').click()
    await expect(dialog).toBeHidden()
    await expectNoFloatingNotice(page)
    await product.click()
    const linked = page.getByTestId('link-row').filter({ hasText: 'ART-OAT-1L' })
    try {
      await expect(linked).toHaveAttribute('data-just-linked', 'true')
      await expect(linked).toBeVisible()
    } finally {
      if (await linked.count()) {
        await linked.click({ button: 'right' })
        const menu = page.getByTestId('context-menu')
        if (await menu.getByRole('menuitem', { name: 'Remove link' }).count()) {
          await menu.getByRole('menuitem', { name: 'Remove link' }).click()
        }
      }
    }
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
      await expectNoFloatingNotice(page)
    } finally {
      await page.request.delete(`/v1/objects/${id}`).catch(() => undefined)
    }
  })
})