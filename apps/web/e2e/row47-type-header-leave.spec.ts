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
  await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator(`[data-row-id="${typeKey}"]`)
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  await expect(page.getByTestId('attribute-table')).toBeVisible()
  return page.getByTestId('attribute-table')
}

test.describe('row 47 type header draft and leave guard', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('a type header edit saves when the field closes, including when Object types is opened', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const plural = page.getByRole('textbox', { name: 'Plural' })
    const before = await plural.inputValue()
    const next = `${before} leave`
    try {
      await plural.fill(next)
      await expect(table.getByTestId('review-and-save')).toHaveCount(0)
      const committed = page.waitForResponse((response) =>
        response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
      const objectTypesTab = page.locator('.pane-tab', { hasText: 'Object types' }).first().locator('.pane-tab-open')
      await expect(objectTypesTab).toBeVisible()
      await objectTypesTab.click()
      const response = await committed
      expect(response.ok(), await response.text()).toBeTruthy()
      await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
      await expect(page.getByTestId('review-dialog')).toHaveCount(0)
      await expect(page.getByTestId('object-types-table')).toBeVisible()
      await expect.poll(async () => {
        const body = (await (await page.request.get('/v1/definitions')).json()) as {
          types?: Array<{ key?: string; plural?: Record<string, string> }>
        }
        return body.types?.find((item) => item.key === 'product')?.plural?.en
      }).toBe(next)
    } finally {
      await page.request.post('/v1/model/draft/steps', {
        data: { steps: [{ op: 'update_type', key: 'product', language: 'en', plural: before }] },
      }).catch(() => undefined)
      await page.request.post('/v1/model/draft/save', { data: {} }).catch(() => undefined)
    }
  })

  test('review workspace switch shows leave dialog', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const brand = table.locator('[data-key="brand"] [data-column="label"]').first()
    const before = await brand.innerText()
    await brand.dblclick()
    await page.getByRole('textbox', { name: 'Name' }).fill('Brand draft row47')
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await page.keyboard.press('Enter')
    expect((await saved).ok()).toBeTruthy()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('braian-open-proposal', { detail: { proposalId: 'unused' } }))
    })
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    const label = async () => {
      const body = (await (await page.request.get('/v1/definitions')).json()) as {
        attributes?: Array<{ key?: string; labels?: Record<string, string> }>
      }
      return body.attributes?.find((item) => item.key === 'brand')?.labels?.en
    }
    await expect.poll(label).toBe('Brand draft row47')
    await page.request.post('/v1/model/draft/steps', {
      data: { steps: [{ op: 'rename_attribute', attribute: 'brand', label: before.trim() }] },
    })
    await page.request.post('/v1/model/draft/save', { data: {} })
  })
})