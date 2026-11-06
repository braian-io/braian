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

async function openProductAttributes(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator('[data-row-id="product"]')
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

test('turning off Show by default saves directly', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const table = await openProductAttributes(page)
  await table.getByTestId('quick-filter').fill('description')
  const row = table.locator('[data-key="description"]')
  const checkbox = row.getByRole('checkbox', { name: 'Show by default' })
  await expect(checkbox).toBeChecked()
  await checkbox.click()
  await expect(checkbox).not.toBeChecked()

  const save = table.getByTestId('review-and-save')
  await expect(save).toHaveText('Save')
  await save.click()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

  // Absent means shown. The API omits show_by_default when it is true.
  const shown = async () => {
    const body = (await (await page.request.get('/v1/definitions')).json()) as {
      attributes?: Array<{ key?: string; show_by_default?: boolean }>
    }
    const attribute = body.attributes?.find((item) => item.key === 'description')
    if (!attribute) return undefined
    return attribute.show_by_default !== false
  }
  await expect.poll(shown).toBe(false)

  await page.reload()
  const reloaded = await openProductAttributes(page)
  await reloaded.getByTestId('quick-filter').fill('description')
  await expect(reloaded.locator('[data-key="description"]').getByRole('checkbox', { name: 'Show by default' })).not.toBeChecked()

  await reloaded.locator('[data-key="description"]').getByRole('checkbox', { name: 'Show by default' }).click()
  const restored = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await reloaded.getByTestId('review-and-save').click()
  expect((await restored).ok()).toBeTruthy()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  await expect.poll(shown).toBe(true)
  await page.reload()
  const again = await openProductAttributes(page)
  await again.getByTestId('quick-filter').fill('description')
  await expect(again.locator('[data-key="description"]').getByRole('checkbox', { name: 'Show by default' })).toBeChecked()
})

test('removing an attribute asks once, and a blocked group removal does not apply', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const key = `spare_${Date.now().toString().slice(-6)}`
  const staged = await page.request.post('/v1/model/draft/steps', {
    data: {
      steps: [
        { op: 'create_attribute', key, label: `Spare ${key}`, kind: 'text' },
        { op: 'attach_attribute', attribute: key, type_key: 'product' },
      ],
    },
  })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()

  const table = await openProductAttributes(page)
  await table.getByTestId('quick-filter').fill(key)
  await table.getByTestId(`attr-menu-${key}`).click()
  await page.getByRole('menuitem', { name: 'Remove from this type' }).click()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  await page.getByTestId('review-save').click()

  const dialog = page.getByTestId('review-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input')).toHaveCount(0)
  const remove = dialog.getByTestId('confirm-review')
  await expect(remove).toHaveText('Delete')
  await expect(remove).toHaveClass(/btn-danger/)
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)

  const attached = async () => {
    const body = (await (await page.request.get('/v1/definitions')).json()) as {
      attributes?: Array<{ id?: string; key?: string }>
      types?: Array<{ key?: string; attributes?: string[] }>
    }
    const id = body.attributes?.find((item) => item.key === key)?.id
    const type = body.types?.find((item) => item.key === 'product')
    return Boolean(id && type?.attributes?.includes(id))
  }
  expect(await attached()).toBe(true)

  await page.getByTestId('review-save').click()
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('confirm-review').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
  await expect.poll(attached).toBe(false)

  const structureResponse = await page.request.get('/v1/structures/food')
  expect(structureResponse.ok()).toBeTruthy()
  const structure = (await structureResponse.json()) as {
    groups?: Array<{ id?: string; key?: string; parent?: string | null }>
  }
  const groups = structure.groups ?? []
  const cheese = groups.find((group) => group.key === 'cheese')
  expect(cheese?.id).toBeTruthy()
  const removed = new Set<string>()
  const drop = (id: string) => {
    removed.add(id)
    for (const group of groups) {
      if (group.parent === id && group.id) drop(group.id)
    }
  }
  drop(String(cheese?.id))
  const blocked = await page.request.post('/v1/model/draft/steps', {
    data: { steps: [{ op: 'upsert_structure', structure: { ...structure, groups: groups.filter((group) => group.id && !removed.has(group.id)) } }] },
  })
  expect(blocked.ok(), await blocked.text()).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  await page.getByTestId('review-save').click()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toContainText('objects are still in groups')
  const after = (await (await page.request.get('/v1/structures/food')).json()) as {
    groups?: Array<{ key?: string }>
  }
  expect(after.groups?.some((group) => group.key === 'cheese')).toBe(true)
  await page.request.delete('/v1/model/draft')
})

test('deleting a group that has products still needs a danger confirm and Escape leaves it', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const tree = page.getByTestId('structure-tree')
  await expect(tree.getByRole('treeitem', { name: 'Cheese' })).toBeVisible()
  await tree.getByRole('treeitem', { name: 'Cheese' }).click()
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('palette-input')
  await expect(palette).toBeVisible()
  await palette.fill('Delete the selected')
  await page.keyboard.press('Enter')

  const dialog = page.getByTestId('consequence')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input')).toHaveCount(0)
  const remove = dialog.getByTestId('confirm-delete')
  await expect(remove).toHaveClass(/btn-danger/)
  await expect(remove).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(tree.getByRole('treeitem', { name: 'Cheese' })).toBeVisible()
})
