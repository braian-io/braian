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
  const typeTable = page.getByTestId('object-types-table')
  const typeRow = typeTable.locator(`[data-row-id="${typeKey}"]`)
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

type Definitions = {
  types?: Array<{ key?: string; attributes?: string[] }>
  attributes?: Array<{ id?: string; key?: string; index?: { searchable?: boolean } }>
}

async function readDefinitions(page: Page) {
  const response = await page.request.get('/v1/definitions')
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as Definitions
}

test.describe('type attributes local draft (row 120)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('switching types with a pending checkbox shows Discard or Review', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const row = table.locator('[data-key="description"]')
    const checkbox = row.getByRole('checkbox', { name: 'Searchable' })
    await checkbox.click()
    await expect(table.getByTestId('review-and-save')).toBeVisible()

    const typeTable = page.getByTestId('object-types-table')
    await typeTable.locator('[data-row-id="article"]').click()
    const dialog = page.getByTestId('model-table-leave-dialog')
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('model-table-leave-discard').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('object-types-table').locator('[data-row-id="article"]')).toHaveClass(/on/)
  })

  test('create, checkbox and detach batch in one table save with no server change before', async ({ page }) => {
    test.setTimeout(180_000)
    const key = `row120_${Date.now().toString().slice(-6)}`
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const before = await readDefinitions(page)
    const productAttrs = [...(before.types?.find((item) => item.key === 'product')?.attributes ?? [])]
    const brandSearchable = before.attributes?.find((item) => item.key === 'brand')?.index?.searchable

    await table.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await expect(create).toBeVisible()
    await create.getByTestId('new-name').fill(key)
    await create.getByTestId('create-object').click()
    await expect(create).toHaveCount(0)
    await expect(table.locator(`[data-key="${key}"]`)).toBeVisible()

    const brandCheckbox = table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' })
    await expect(brandCheckbox).toBeVisible()
    await brandCheckbox.click()
    await table.locator('[data-key="description"]').getByTestId('attr-menu-description').click()
    await page.getByRole('menuitem', { name: 'Remove from this type' }).click()
    await expect(table.getByTestId('review-and-save')).toBeVisible()

    const mid = await readDefinitions(page)
    expect(mid.attributes?.some((item) => item.key === key)).toBe(false)
    expect(mid.types?.find((item) => item.key === 'product')?.attributes).toEqual(productAttrs)
    expect(mid.attributes?.find((item) => item.key === 'brand')?.index?.searchable).toBe(brandSearchable)

    const staged = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    await table.getByTestId('review-and-save').click()
    const body = (await staged).request().postDataJSON() as { steps?: unknown[] }
    expect(Array.isArray(body.steps)).toBeTruthy()
    expect(body.steps?.length).toBeGreaterThanOrEqual(3)

    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible()
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await dialog.getByTestId('confirm-review').click()
    expect((await saved).ok()).toBeTruthy()
    await expect(dialog).toHaveCount(0)

    await expect.poll(async () => {
      const body = await readDefinitions(page)
      return body.attributes?.find((item) => item.key === 'brand')?.index?.searchable
    }).not.toBe(brandSearchable)
    const after = await readDefinitions(page)
    expect(after.attributes?.some((item) => item.key === key)).toBe(true)
    const productType = after.types?.find((item) => item.key === 'product')
    const descriptionId = after.attributes?.find((item) => item.key === 'description')?.id
    expect(descriptionId && productType?.attributes?.includes(descriptionId)).toBe(false)

    const restoreSteps: Array<Record<string, unknown>> = [
      { op: 'attach_attribute', attribute: 'description', type_key: 'product' },
    ]
    if (brandSearchable !== undefined) {
      restoreSteps.push({ op: 'update_attribute', key: 'brand', searchable: brandSearchable })
    }
    const restoreStage = await page.request.post('/v1/model/draft/steps', { data: { steps: restoreSteps } })
    expect(restoreStage.ok(), await restoreStage.text()).toBeTruthy()
    const restoreSave = await page.request.post('/v1/model/draft/save', { data: {} })
    expect(restoreSave.ok(), await restoreSave.text()).toBeTruthy()
  })
})