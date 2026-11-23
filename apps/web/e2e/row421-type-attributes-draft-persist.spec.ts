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

async function openTypeAttributes(page: Page, typeKey: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator(`[data-row-id="${typeKey}"]`)
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

test.describe('type attributes draft persist (row 421)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('reload keeps a create draft until Save applies it', async ({ page }) => {
    test.setTimeout(180_000)
    const key = `row421_${Date.now().toString().slice(-6)}`
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await table.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await expect(create).toBeVisible()
    await create.getByTestId('new-name').fill(key)
    await create.getByTestId('create-object').click()
    await expect(table.locator(`[data-key="${key}"]`)).toHaveAttribute('data-draft', 'true')
    await expect(table.getByTestId('review-and-save')).toBeVisible()
    await page.reload()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator(`[data-key="${key}"]`)).toHaveAttribute('data-draft', 'true')
    await expect(reloaded.getByTestId('review-and-save')).toBeVisible()
    const staged = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    await reloaded.getByTestId('review-and-save').click()
    expect((await staged).ok()).toBeTruthy()
    const saved = await page.request.get('/v1/definitions')
    const body = (await saved.json()) as { attributes?: Array<{ key?: string }> }
    expect(body.attributes?.some((item) => item.key === key)).toBe(true)
  })

  test('workspace switch with a dirty draft shows leave dialog actions', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await table.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect(table.getByTestId('review-and-save')).toBeVisible()

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const dialog = page.getByTestId('model-table-leave-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
    await expect(table.getByTestId('review-and-save')).toBeVisible()

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('model-table-leave-discard').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('nav.tabs .tab.active', { hasText: /^Products/ })).toBeVisible()
  })

  test('registers beforeunload only while the draft is dirty', async ({ page }) => {
    test.setTimeout(120_000)
    await page.addInitScript(() => {
      let count = 0
      const target = window as Window & { __beforeunloadAdds?: number }
      const add = window.addEventListener.bind(window)
      const remove = window.removeEventListener.bind(window)
      window.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type === 'beforeunload') count += 1
        target.__beforeunloadAdds = count
        return add(type, listener, options)
      }) as typeof window.addEventListener
      window.removeEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | EventListenerOptions,
      ) => {
        if (type === 'beforeunload') count = Math.max(0, count - 1)
        target.__beforeunloadAdds = count
        return remove(type, listener, options)
      }) as typeof window.removeEventListener
    })
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await expect.poll(async () => page.evaluate(() => (window as Window & { __beforeunloadAdds?: number }).__beforeunloadAdds ?? 0)).toBe(0)
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect.poll(async () => page.evaluate(() => (window as Window & { __beforeunloadAdds?: number }).__beforeunloadAdds ?? 0)).toBeGreaterThan(0)
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect.poll(async () => page.evaluate(() => (window as Window & { __beforeunloadAdds?: number }).__beforeunloadAdds ?? 0)).toBe(0)
  })
})