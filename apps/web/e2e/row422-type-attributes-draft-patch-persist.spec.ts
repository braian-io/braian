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
  const table = page.getByTestId('attribute-table')
  const typeRow = page.getByTestId('object-types-table').locator(`[data-row-id="${typeKey}"]`)
  if (await table.isVisible() && await typeRow.evaluate((row) => row.classList.contains('on')).catch(() => false)) {
    return table
  }
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  await expect(table).toBeVisible()
  await expect(typeRow).toHaveClass(/on/)
  return table
}

type Definitions = {
  attributes?: Array<{ key?: string; index?: { searchable?: boolean; filterable?: boolean } }>
}

async function readDefinitions(page: Page) {
  const response = await page.request.get('/v1/definitions')
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as Definitions
}

async function stageAndSave(page: Page, steps: Array<Record<string, unknown>>) {
  const staged = await page.request.post('/v1/model/draft/steps', { data: { steps } })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
}

test.describe('type attributes draft patch persist (row 422)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('reload keeps an API change on another field while saving the drafted field', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const before = await readDefinitions(page)
    const brandBefore = before.attributes?.find((item) => item.key === 'brand')
    const brandSearchable = Boolean(brandBefore?.index?.searchable)
    const brandFilterable = Boolean(brandBefore?.index?.filterable)

    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    const commitBody = (await saved).request().postDataJSON() as { steps?: Array<Record<string, unknown>> }
    const update = commitBody.steps?.find((step) => step.op === 'update_attribute' && step.key === 'brand')
    expect(update?.searchable).toBe(!brandSearchable)
    expect(update?.filterable).toBeUndefined()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)

    await stageAndSave(page, [
      { op: 'update_attribute', key: 'brand', filterable: !brandFilterable },
    ])

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)

    await expect.poll(async () => {
      const body = await readDefinitions(page)
      const brand = body.attributes?.find((item) => item.key === 'brand')
      return {
        searchable: Boolean(brand?.index?.searchable),
        filterable: Boolean(brand?.index?.filterable),
      }
    }).toEqual({ searchable: !brandSearchable, filterable: !brandFilterable })

    await stageAndSave(page, [{
      op: 'update_attribute',
      key: 'brand',
      searchable: brandSearchable,
      filterable: brandFilterable,
    }])
  })

  test('reload drops a drafted field changed on the server and shows a notice', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const before = await readDefinitions(page)
    const brandSearchable = Boolean(before.attributes?.find((item) => item.key === 'brand')?.index?.searchable)

    await page.route('**/v1/model/commit', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'draft_conflict', detail: 'the model moved' }),
      })
    })
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect(table.locator('[data-key="brand"]').getByTestId('cell-save-state')).toHaveAttribute('data-state', 'error')
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await page.unroute('**/v1/model/commit')

    // Same field updated on the server away from the stored base triggers a conflict drop.
    await stageAndSave(page, [{ op: 'update_attribute', key: 'brand', searchable: !brandSearchable }])

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(page.getByTestId('model-pane-notice')).toContainText(
      'Dropped unsaved change to brand (searchable) because the model changed.',
    )
    const checkbox = reloaded.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' })
    await expect(checkbox).toBeChecked({ checked: !brandSearchable })
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
  })
})