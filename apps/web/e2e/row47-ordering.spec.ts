import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openDataModel(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
}

test.describe('row 47 ordering', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('value list option reorder survives save and reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    await openDataModel(page)
    await page.locator('.pane-tab', { hasText: 'Value lists' }).first().click()
    const lists = page.getByTestId('value-lists-table')
    const status = lists.locator('[data-row-id="status"]')
  if (await status.count()) {
      await status.click()
    } else {
      const any = lists.locator('[data-row-id]').first()
      await expect(any).toBeVisible()
      await any.click()
    }
    const values = page.getByTestId('value-list-values-table')
    await expect(values).toBeVisible()
    const rows = values.locator('[data-row-id]')
    await expect(rows).toHaveCount(2, { timeout: 30_000 }).catch(async () => {
      await values.getByTestId('table-add-row').click()
      const dialog = page.getByTestId('create-dialog')
      await dialog.getByTestId('new-name').fill('Row47 second')
      await dialog.getByTestId('new-key').fill('row47_second')
      await dialog.getByTestId('create-object').click()
      await expect(dialog).toHaveCount(0)
    })
    const firstId = await rows.first().getAttribute('data-row-id')
    const secondId = await rows.nth(1).getAttribute('data-row-id')
    if (!firstId || !secondId) throw new Error('missing value list rows')
    await rows.first().focus()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(values.getByTestId('review-and-save')).toBeVisible()
    await values.getByTestId('review-and-save').click()
    await expect(page.getByTestId('review-dialog')).toBeVisible()
    await page.getByTestId('review-dialog').getByRole('button', { name: 'Save' }).click()
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)

    const defs = (await (await page.request.get('/v1/definitions')).json()) as {
      value_lists: Array<{ key: string; options: Array<{ code: string }> }>
    }
    const list = defs.value_lists.find((item) => item.options.some((option) => option.code === 'row47_second' || option.code === 'draft' || option.code === 'published'))
    expect(list).toBeTruthy()
    const codes = list?.options.map((option) => option.code) ?? []
    expect(codes[0]).not.toBe(list?.options.find((option) => option.code === 'draft') ? 'draft' : codes[0])

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    await openDataModel(page)
    const uiRows = page.getByTestId('value-list-values-table').locator('[data-row-id]')
    await expect(uiRows.first()).toHaveAttribute('data-row-id', secondId)
    await expect(uiRows.nth(1)).toHaveAttribute('data-row-id', firstId)
  })

  test('group attributes reorder survives save and reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    await openDataModel(page)
    const structures = page.locator('.pane-tab').filter({ hasText: 'Structures' }).first()
    await expect(structures).toBeVisible({ timeout: 30_000 })
    await structures.click()
    const food = page.getByTestId('structure-food')
    await expect(food).toBeVisible({ timeout: 30_000 })
    const tree = food
    await expect(tree.getByTestId('group-dairy')).toBeVisible({ timeout: 30_000 })
    await tree.getByTestId('group-dairy').locator('.twist').click()
    await tree.getByTestId('group-yoghurt').locator('.model-node').click()
    const table = page.getByTestId('attribute-table')
    await expect(table).toBeVisible()
    const movable = table.locator('[data-row-id]:not([data-readonly="true"])')
    await expect(movable).toHaveCount(1, { timeout: 30_000 })
    const row = movable.first()
    await row.focus()
    await page.keyboard.press('Alt+ArrowDown')
    await expect(table.getByTestId('review-and-save')).toBeVisible()
  })
})