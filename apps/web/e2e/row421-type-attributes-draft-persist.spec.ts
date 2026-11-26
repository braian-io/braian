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
  attributes?: Array<{ key?: string; index?: { searchable?: boolean } }>
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

async function modelTableDraftStorageKey(page: Page, selectionKey: string) {
  const me = (await (await page.request.get('/v1/me')).json()) as { user_id?: string }
  const userId = me.user_id ?? ''
  return page.evaluate(
    ({ uid, selection }) => {
      const raw = localStorage.getItem(`braian.activeWorkspace.${uid}`)
      const workspaceId = raw ? JSON.parse(raw) as string : ''
      return `braian.model-table-draft.${uid}.${workspaceId}.${selection}`
    },
    { uid: userId, selection: selectionKey },
  )
}

async function readDraftStorage(page: Page, selectionKey: string) {
  const key = await modelTableDraftStorageKey(page, selectionKey)
  return page.evaluate((storageKey) => localStorage.getItem(storageKey), key)
}

test.describe('type attributes draft persist (row 421)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('create attribute saves when the dialog is confirmed and survives reload', async ({ page }) => {
    test.setTimeout(180_000)
    const key = `row421_${Date.now().toString().slice(-6)}`
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await table.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await expect(create).toBeVisible()
    await create.getByTestId('new-name').fill(key)
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await create.getByTestId('create-object').click()
    expect((await saved).ok()).toBeTruthy()
    await expect(table.locator(`[data-key="${key}"]`)).toBeVisible()
    await expect(table.locator(`[data-key="${key}"]`)).not.toHaveAttribute('data-draft', 'true')
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    const body = (await (await page.request.get('/v1/definitions')).json()) as {
      attributes?: Array<{ key?: string }>
    }
    expect(body.attributes?.some((item) => item.key === key)).toBe(true)
    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator(`[data-key="${key}"]`)).toBeVisible()
    await expect(reloaded.locator(`[data-key="${key}"]`)).not.toHaveAttribute('data-draft', 'true')
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
  })

  test('leave dialog Cancel keeps the draft across Escape, Close, and reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const checkbox = table.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' })
    const before = await checkbox.isChecked()
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await checkbox.click()
    expect((await saved).ok()).toBeTruthy()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await expect.poll(async () => readDraftStorage(page, 'product')).toBeNull()

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
    await expect(page.locator('nav.tabs .tab.active', { hasText: /^Products/ })).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' })).toBeChecked({ checked: !before })
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
    await stageAndSave(page, [{ op: 'update_attribute', key: 'description', searchable: before }])
  })

  test('leave dialog Save applies the edit, navigates, and clears local draft', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const before = await readDefinitions(page)
    const searchableBefore = Boolean(before.attributes?.find((item) => item.key === 'description')?.index?.searchable)

    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await table.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' }).click()
    expect((await saved).ok()).toBeTruthy()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await expect(page.locator('nav.tabs .tab.active', { hasText: /^Products/ })).toBeVisible()
    await expect.poll(async () => readDraftStorage(page, 'product')).toBeNull()

    await expect.poll(async () => {
      const body = await readDefinitions(page)
      return Boolean(body.attributes?.find((item) => item.key === 'description')?.index?.searchable)
    }).toBe(!searchableBefore)

    await stageAndSave(page, [{ op: 'update_attribute', key: 'description', searchable: searchableBefore }])
  })

  test('leave dialog Discard drops local draft and nothing restores after reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const checkbox = table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' })
    const before = await checkbox.isChecked()
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await checkbox.click()
    expect((await saved).ok()).toBeTruthy()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
    await expect(page.locator('nav.tabs .tab.active', { hasText: /^Products/ })).toBeVisible()
    await expect.poll(async () => readDraftStorage(page, 'product')).toBeNull()

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' })).toBeChecked({ checked: !before })
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
    await expect(await readDraftStorage(page, 'product')).toBeNull()
    await stageAndSave(page, [{ op: 'update_attribute', key: 'brand', searchable: before }])
  })

  test('a confirmed create is stored, so reload does not restore a local draft', async ({ page }) => {
    test.setTimeout(180_000)
    const key = `row421trim_${Date.now().toString().slice(-6)}`
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await table.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await expect(create).toBeVisible()
    await create.getByTestId('new-name').fill(key)
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await create.getByTestId('create-object').click()
    expect((await saved).ok()).toBeTruthy()
    await expect(table.locator(`[data-key="${key}"]`)).not.toHaveAttribute('data-draft', 'true')
    await expect.poll(async () => readDraftStorage(page, 'product')).toBeNull()

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(page.locator('[data-sonner-toast]').filter({
      hasText: 'Some unsaved table edits were dropped because the model changed.',
    })).toHaveCount(0)
    await expect(reloaded.locator(`[data-key="${key}"]`)).toHaveCount(1)
    await expect(reloaded.locator(`[data-key="${key}"]`)).not.toHaveAttribute('data-draft', 'true')
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
    await expect(await readDraftStorage(page, 'product')).toBeNull()
  })

  test('beforeunload prompt is active only while the draft is dirty', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const warns = () => page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
    expect(await warns()).toBe(false)
    await page.route('**/v1/model/commit', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ code: 'draft_conflict', detail: 'the model moved' }),
      })
    })
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect.poll(warns).toBe(true)
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await expect(table.locator('[data-key="brand"]').getByTestId('cell-save-state')).toHaveAttribute('data-state', 'error')
    await page.unroute('**/v1/model/commit')
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect.poll(warns).toBe(false)
  })
})