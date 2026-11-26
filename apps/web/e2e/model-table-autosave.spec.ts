import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, waitDetailReady } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProductAttributes(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const types = page.getByTestId('object-types-table')
  await expect(types).toBeVisible({ timeout: 30_000 })
  const typeRow = types.locator('[data-row-id="product"]')
  await expect(typeRow).toBeVisible()
  await expect(typeRow).toBeEnabled()
  await typeRow.click()
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

async function brandDescription(page: Page) {
  const body = (await (await page.request.get('/v1/definitions')).json()) as {
    attributes?: Array<{ key?: string; description?: string }>
  }
  return body.attributes?.find((item) => item.key === 'brand')?.description ?? ''
}

test('a type attribute cell saves when it closes, and a new category attribute shows on a child product', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString(36)
  const help = `Autosave ${stamp}`
  const attributeLabel = `Autosave fat ${stamp}`
  const attributeKey = `autosave_fat_${stamp}`
  const linkKey = `autosave_link_${stamp}`
  const productNumber = `AUTO-${stamp}`
  let original = ''
  await login(page)
  try {
    original = await brandDescription(page)
    const table = await openProductAttributes(page)
    await table.getByTestId('quick-filter').fill('brand')
    const row = table.locator('[data-key="brand"]')
    const descCell = row.locator('[data-column="description"]')
    await descCell.scrollIntoViewIfNeeded()
    await descCell.dblclick()
    const editor = row.getByTestId('attr-desc-brand')
    await expect(editor).toBeVisible()
    await editor.fill(help)
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await editor.press('Enter')
    expect((await saved).ok()).toBeTruthy()
    await expect(table.getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await expect(page.getByTestId('review-loading')).toHaveCount(0)
    await expect(row.getByTestId('cell-save-state')).toHaveAttribute('data-state', 'saved')
    await expect.poll(() => brandDescription(page)).toBe(help)

    await page.reload()
    const reloaded = await openProductAttributes(page)
    await reloaded.getByTestId('quick-filter').fill('brand')
    await expect(reloaded.locator('[data-key="brand"]').locator('[data-column="description"]')).toContainText(help)
    await expect(reloaded.getByTestId('review-and-save')).toHaveCount(0)

    await page.locator('.pane-tab', { hasText: 'Link types' }).first().click()
    const links = page.getByTestId('link-types-table')
    await expect(links).toBeVisible()
    await links.getByTestId('table-add-row').click()
    const linkDialog = page.getByTestId('create-dialog')
    await linkDialog.getByTestId('new-name').fill(linkKey)
    await linkDialog.getByTestId('link-type-from').click()
    await page.getByRole('option', { name: 'product' }).click()
    await linkDialog.getByTestId('link-type-to').click()
    await page.getByRole('option', { name: 'supplier' }).click()
    const linkSaved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await linkDialog.getByTestId('create-object').click()
    expect((await linkSaved).ok()).toBeTruthy()
    await expect(linkDialog).toHaveCount(0)
    await expect(links.getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
    await expect(links.locator(`[data-row-id="${linkKey}"]`)).toBeVisible()

    await page.locator('.pane-tab').filter({ hasText: 'Structures' }).first().click()
    const tree = page.getByTestId('data-model').filter({ has: page.getByTestId('group-dairy') }).first()
    await expect(tree.getByTestId('group-dairy')).toBeVisible({ timeout: 30_000 })
    await tree.getByTestId('group-dairy').locator('.model-node').click()
    const groupTable = page.getByTestId('attribute-table')
    await expect(groupTable).toBeVisible()
    await groupTable.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await create.getByTestId('new-name').fill(attributeLabel)
    await create.getByTestId('new-type').click()
    await page.getByRole('option', { name: 'Number' }).click()
    const created = page.waitForResponse((response) =>
      response.url().includes('/v1/model/commit') && response.request().method() === 'POST')
    await create.getByTestId('create-object').click()
    expect((await created).ok()).toBeTruthy()
    await expect(groupTable.locator(`[data-key="${attributeKey}"]`)).toBeVisible()
    await expect(groupTable.getByTestId('review-and-save')).toHaveCount(0)

    const product = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'milk' },
        values: { number: productNumber, name: { en: productNumber }, status: 'draft' },
      },
    })
    expect(product.ok(), await product.text()).toBeTruthy()
    const createdObject = await product.json() as { id: string }

    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await expect(mainTable(page)).toBeVisible()
    await mainTable(page).getByTestId('quick-filter').first().fill(productNumber)
    const objectRow = page.locator(`#object-row-${createdObject.id}`)
    await expect(objectRow).toBeVisible({ timeout: 60_000 })
    await objectRow.click()
    await waitDetailReady(page)
    await expect(page.getByTestId('object-detail').getByText(attributeLabel)).toBeVisible()
  } finally {
    await page.request.post('/v1/model/draft/steps', {
      data: {
        steps: [
          original.trim()
            ? { op: 'update_attribute', key: 'brand', description: original }
            : { op: 'update_attribute', key: 'brand', clear_description: true },
        ],
      },
    }).catch(() => {})
    await page.request.post('/v1/model/draft/save', { data: {} }).catch(() => {})
    await page.request.post('/v1/model/draft/steps', {
      data: { steps: [{ op: 'delete_attribute', key: attributeKey }, { op: 'delete_link_type', key: linkKey }] },
    }).catch(() => {})
    await page.request.post('/v1/model/draft/save', { data: {} }).catch(() => {})
  }
})
