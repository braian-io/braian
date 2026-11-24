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

async function expectDraftDirty(page: Page, table: ReturnType<Page['getByTestId']>) {
  await expect(table.getByTestId('review-and-save')).toBeVisible()
  await expect(await readDraftStorage(page, 'product')).not.toBeNull()
}

test.describe('type attributes draft persist (row 421)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete('/v1/model/draft')
    } catch {
      // Login may have failed.
    }
  })

  test('create attribute, reload, draft row remains and Save applies it', async ({ page }) => {
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
    await expect(page.getByTestId('workspace')).toBeVisible()
    await expect(page.getByTestId('model-table-leave-dialog')).toHaveCount(0)
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator(`[data-key="${key}"]`)).toHaveAttribute('data-draft', 'true')
    await expect(reloaded.getByTestId('review-and-save')).toBeVisible()
    const staged = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await reloaded.getByTestId('review-and-save').click()
    expect((await staged).ok()).toBeTruthy()
    expect((await saved).ok()).toBeTruthy()
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    const body = (await (await page.request.get('/v1/definitions')).json()) as {
      attributes?: Array<{ key?: string }>
    }
    expect(body.attributes?.some((item) => item.key === key)).toBe(true)

    await stageAndSave(page, [
      { op: 'detach_attribute', attribute: key, type_key: 'product' },
      { op: 'delete_attribute', key },
    ])
  })

  test('leave dialog Cancel keeps the draft across Escape, Close, and reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const checkbox = table.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' })
    const before = await checkbox.isChecked()
    await checkbox.click()
    await expectDraftDirty(page, table)
    const dialog = page.getByTestId('model-table-leave-dialog')

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expectDraftDirty(page, table)

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    await expectDraftDirty(page, table)

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' })).toBeChecked({ checked: !before })
    await expectDraftDirty(page, reloaded)

    await reloaded.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' }).click()
    const staged = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await reloaded.getByTestId('review-and-save').click()
    expect((await staged).ok()).toBeTruthy()
    expect((await saved).ok()).toBeTruthy()
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  })

  test('leave dialog Save applies the edit, navigates, and clears local draft', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    const before = await readDefinitions(page)
    const searchableBefore = Boolean(before.attributes?.find((item) => item.key === 'description')?.index?.searchable)

    await table.locator('[data-key="description"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expectDraftDirty(page, table)
    const dialog = page.getByTestId('model-table-leave-dialog')
    const staged = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/steps') && response.request().method() === 'POST')
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('model-table-leave-review').click()
    expect((await staged).ok()).toBeTruthy()
    const review = page.getByTestId('review-dialog')
    if (await review.count()) {
      await review.getByTestId('confirm-review').click()
    }
    expect((await saved).ok()).toBeTruthy()
    await expect(dialog).toHaveCount(0)
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
    await checkbox.click()
    await expectDraftDirty(page, table)
    const dialog = page.getByTestId('model-table-leave-dialog')

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByTestId('model-table-leave-discard').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('nav.tabs .tab.active', { hasText: /^Products/ })).toBeVisible()
    await expect.poll(async () => readDraftStorage(page, 'product')).toBeNull()

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(reloaded.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' })).toBeChecked({ checked: before })
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
    await expect(await readDraftStorage(page, 'product')).toBeNull()
  })

  test('trim toast when a create-row draft key already exists on the server', async ({ page }) => {
    test.setTimeout(180_000)
    const key = `row421trim_${Date.now().toString().slice(-6)}`
    await login(page)
    const table = await openTypeAttributes(page, 'product')
    await table.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await expect(create).toBeVisible()
    await create.getByTestId('new-name').fill(key)
    await create.getByTestId('create-object').click()
    await expect(table.locator(`[data-key="${key}"]`)).toHaveAttribute('data-draft', 'true')
    await expect(await readDraftStorage(page, 'product')).not.toBeNull()

    await stageAndSave(page, [
      { op: 'create_attribute', key, label: `Server ${key}`, kind: 'text' },
      { op: 'attach_attribute', attribute: key, type_key: 'product' },
    ])

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const reloaded = await openTypeAttributes(page, 'product')
    await expect(page.locator('[data-sonner-toast]').filter({
      hasText: 'Some unsaved table edits were dropped because the model changed.',
    })).toBeVisible()
    await expect(reloaded.locator(`[data-key="${key}"]`)).toHaveCount(1)
    await expect(reloaded.locator(`[data-key="${key}"]`)).not.toHaveAttribute('data-draft', 'true')
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)
    await expect(await readDraftStorage(page, 'product')).toBeNull()

    await stageAndSave(page, [
      { op: 'detach_attribute', attribute: key, type_key: 'product' },
      { op: 'delete_attribute', key },
    ])
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
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect.poll(warns).toBe(true)
    await table.locator('[data-key="brand"]').getByRole('checkbox', { name: 'Searchable' }).click()
    await expect.poll(warns).toBe(false)
  })
})