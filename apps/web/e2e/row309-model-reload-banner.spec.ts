import { expect, test, type Browser, type Page } from '@playwright/test'
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
  await expect(page.getByTestId('data-model').first()).toBeVisible({ timeout: 30_000 })
}

async function openTypeAttributes(page: Page, typeKey: string) {
  await openDataModel(page)
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

async function stageAndSaveUi(page: Page, steps: Array<Record<string, unknown>>) {
  const staged = await page.request.post('/v1/model/draft/steps', { data: { steps } })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible({ timeout: 30_000 })
  const saved = page.waitForResponse(
    (response) => response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST',
  )
  await page.getByTestId('review-save').click()
  const response = await saved
  expect(response.ok()).toBeTruthy()
  await expect(page.getByTestId('model-reload-banner')).toHaveCount(0)
}

test.describe('model reload banner (row 309)', () => {
  test('remote save shows reload banner; reload keeps the table draft', async ({ browser }) => {
    test.setTimeout(180_000)
    const stamp = Date.now().toString(36)
    const plural = `Products ${stamp}`
    let contextA: Awaited<ReturnType<Browser['newContext']>> | null = null
    let contextB: Awaited<ReturnType<Browser['newContext']>> | null = null
    try {
      contextA = await browser.newContext()
      contextB = await browser.newContext()
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()
      await login(pageA)
      await login(pageB)

      const tableB = await openTypeAttributes(pageB, 'product')
      const searchable = tableB.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' })
      const before = await searchable.isChecked()
      await searchable.click()
      await expect(tableB.getByTestId('review-and-save')).toBeVisible()

      await openDataModel(pageA)
      await stageAndSaveUi(pageA, [{
        op: 'update_type',
        type_key: 'product',
        language: 'en',
        plural,
      }])

      await expect(pageB.getByTestId('model-reload-banner')).toBeVisible({ timeout: 30_000 })
      await expect(pageB.getByText('Model changed – reload')).toBeVisible()
      await expect(pageA.getByTestId('model-reload-banner')).toHaveCount(0)

      await pageB.getByTestId('model-reload-button').click()
      await expect(pageB.getByTestId('model-reload-banner')).toHaveCount(0, { timeout: 30_000 })

      const defs = (await (await pageB.request.get('/v1/definitions')).json()) as {
        types?: Array<{ key?: string; plural?: Record<string, string> }>
      }
      const product = defs.types?.find((item) => item.key === 'product')
      expect(product?.plural?.en).toBe(plural)

      const tableAfter = await openTypeAttributes(pageB, 'product')
      await expect(tableAfter.getByTestId('review-and-save')).toBeVisible()
      await expect(searchable).toBeChecked({ checked: !before })
    } finally {
      try {
        const cleanup = await browser.newContext()
        const page = await cleanup.newPage()
        await login(page)
        await page.request.delete('/v1/model/draft').catch(() => {})
        await page.request.post('/v1/model/draft/steps', {
          data: {
            steps: [{ op: 'update_type', type_key: 'product', language: 'en', plural: 'Products' }],
          },
        }).catch(() => {})
        await page.request.post('/v1/model/draft/save', { data: {} }).catch(() => {})
        await cleanup.close()
      } catch {
        // Best-effort cleanup.
      }
      await contextA?.close()
      await contextB?.close()
    }
  })
})