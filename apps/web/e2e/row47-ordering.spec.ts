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

async function openGroupYoghurtAttributes(page: Page) {
  await openDataModel(page)
  const structures = page.locator('.pane-tab').filter({ hasText: 'Structures' }).first()
  await expect(structures).toBeVisible({ timeout: 30_000 })
  await structures.click()
  const tree = page.getByTestId('data-model').filter({ has: page.getByTestId('group-dairy') }).first()
  await expect(tree.getByTestId('group-dairy')).toBeVisible({ timeout: 30_000 })
  await expect(async () => {
    const dairy = tree.getByTestId('group-dairy')
    const button = dairy.getByRole('button', { name: 'Dairy & eggs' })
    if ((await button.getAttribute('aria-expanded')) !== 'true') {
      await dairy.locator('.twist').click({ timeout: 3_000 })
    }
    await expect(tree.getByTestId('group-yoghurt')).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await tree.getByTestId('group-yoghurt').locator('.model-node').click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

async function createOwnAttribute(
  page: Page,
  table: ReturnType<Page['getByTestId']>,
  key: string,
) {
  await table.getByTestId('table-add-row').click()
  const create = page.getByTestId('create-dialog')
  await expect(create).toBeVisible()
  await create.getByTestId('new-name').fill(key)
  await create.getByTestId('create-object').click()
  await expect(create).toHaveCount(0)
  await expect(table.locator(`[data-key="${key}"]`)).toBeVisible()
}

async function expectAttributeCreatesCommitted(page: Page) {
  const table = page.getByTestId('attribute-table')
  await expect(table.getByTestId('review-and-save')).toHaveCount(0)
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
}

type Definitions = {
  attributes: Array<{ id: string; key: string }>
  structures: Array<{
    key: string
    groups: Array<{ key: string; attributes?: string[] }>
  }>
}

function groupOwnAttributeKeys(defs: Definitions, structureKey: string, groupKey: string) {
  const byId = new Map(defs.attributes.map((item) => [item.id, item.key]))
  const group = defs.structures
    .find((item) => item.key === structureKey)
    ?.groups.find((item) => item.key === groupKey)
  const tokens = group?.attributes ?? []
  return tokens.map((id) => byId.get(id)).filter((key): key is string => Boolean(key))
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
    const reordered = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await page.keyboard.press('Alt+ArrowDown')
    expect((await reordered).ok()).toBeTruthy()
    await expect(values.getByTestId('review-and-save')).toHaveCount(0)
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
    const suffix = Date.now().toString().slice(-6)
    const firstKey = `row47_g1_${suffix}`
    const secondKey = `row47_g2_${suffix}`
    let table = await openGroupYoghurtAttributes(page)
    await createOwnAttribute(page, table, firstKey)
    await createOwnAttribute(page, table, secondKey)
    await expectAttributeCreatesCommitted(page)

    table = await openGroupYoghurtAttributes(page)
    const movable = table.locator('[data-row-id]:not([data-readonly="true"])')
    await expect(movable).toHaveCount(2, { timeout: 30_000 })
    const firstId = await movable.first().getAttribute('data-row-id')
    const secondId = await movable.nth(1).getAttribute('data-row-id')
    if (!firstId || !secondId) throw new Error('missing movable group attribute rows')

    await movable.first().focus()
    const reordered = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await page.keyboard.press('Alt+ArrowDown')
    expect((await reordered).ok()).toBeTruthy()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)

    const defs = (await (await page.request.get('/v1/definitions')).json()) as Definitions
    const keys = groupOwnAttributeKeys(defs, 'food', 'yoghurt')
    expect(keys).toEqual([secondKey, firstKey])

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    table = await openGroupYoghurtAttributes(page)
    const uiMovable = table.locator('[data-row-id]:not([data-readonly="true"])')
    await expect(uiMovable).toHaveCount(2)
    await expect(uiMovable.first()).toHaveAttribute('data-row-id', secondId)
    await expect(uiMovable.nth(1)).toHaveAttribute('data-row-id', firstId)
  })
})