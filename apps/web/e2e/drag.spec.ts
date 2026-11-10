import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type Workspace = {
  id: string
  name: string
  locked: boolean
  share_token?: string
  layout: unknown
  views: Array<{ id: string; type: string; title: string; pane: string; position: number; state: Record<string, unknown> }>
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible()
}

async function workspaceByName(request: APIRequestContext, name: string) {
  const listed = await request.get('/v1/workspaces')
  const body = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
  const row = body.workspaces.find((item) => item.name === name)
  if (!row) throw new Error(`missing workspace ${name}`)
  const full = await request.get(`/v1/workspaces/${row.id}`)
  return (await full.json()) as Workspace
}

async function clearPersonalLayout(page: Page, workspaceId: string) {
  await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
  const me = await page.request.get('/v1/me')
  const userId = ((await me.json()) as { user_id?: string }).user_id
  if (userId) {
    await page.evaluate((key) => localStorage.removeItem(key), `braian.layout.${userId}.default.${workspaceId}`)
  }
  const deleted = await page.request.delete(`/v1/workspaces/${workspaceId}/state?environment=default`)
  expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
}

test('column width is restored after reload', async ({ page }) => {
  await login(page)
  const before = await workspaceByName(page.request, 'Products')
  const view = before.views.find((item) => item.type === 'object_table')
  if (!view) throw new Error('missing object table')
  const handle = mainTable(page).getByTestId('resize-name').first()
  const box = await handle.boundingBox()
  if (!box) throw new Error('missing resize handle')
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 70, box.y + box.height / 2)
  await page.mouse.up()
  await expect.poll(async () => {
    const current = await workspaceByName(page.request, 'Products')
    const table = current.views.find((item) => item.id === view.id)?.state.table as { sizes?: { name?: number } } | undefined
    return table?.sizes?.name ?? 0
  }).toBeGreaterThan(200)
  await page.reload()
  await expect(mainTable(page).getByTestId('col-name').first()).toBeVisible()
  const restored = await mainTable(page).getByTestId('col-name').first().evaluate((node) => (node as HTMLElement).style.width)
  expect(Number.parseFloat(restored)).toBeGreaterThan(200)
  await page.request.post('/v1/views', {
    data: {
      id: view.id,
      workspace_id: before.id,
      type: view.type,
      title: view.title,
      pane: view.pane,
      position: view.position,
      state: view.state,
    },
  })
})

test('dragging a pane tab docks it and can be restored', async ({ page }) => {
  await login(page)
  const before = await workspaceByName(page.request, 'Products')
  await clearPersonalLayout(page, before.id)
  const dividers = await page.getByTestId('split-divider').count()
  try {
    const tab = page.locator('.pane-tab', { hasText: 'Graph' })
    const pane = page.locator('section.pane').filter({ has: tab })
    const tabBox = await tab.boundingBox()
    const paneBox = await pane.boundingBox()
    if (!tabBox || !paneBox) throw new Error('missing graf tab')
    await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(paneBox.x + paneBox.width * 0.9, paneBox.y + paneBox.height * 0.5, { steps: 12 })
    await expect(page.getByTestId('drop-right')).toBeVisible()
    await page.mouse.up()
    await expect(page.getByTestId('split-divider')).toHaveCount(dividers + 1)
  } finally {
    await clearPersonalLayout(page, before.id)
    await expect(page.getByTestId('split-divider')).toHaveCount(dividers)
  }
})

test('a group shows attributes inherited from its ancestors', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.getByRole('button', { name: 'Data model' }).click()
  // Wait for the model workspace to finish any heal/migrate remount before expanding.
  await expect(page.locator('.pane-tab').filter({ hasText: 'Structures' })).toBeVisible({ timeout: 30_000 })
  const tree = page.getByTestId('data-model').first()
  await expect(tree.getByTestId('group-dairy')).toBeVisible()
  await tree.getByTestId('group-dairy').locator('.twist').click()
  await expect(tree.getByTestId('group-yoghurt')).toBeVisible()
  // Tree can remount when workspace queries invalidate; re-query until the click sticks.
  await expect(async () => {
    await page.getByTestId('data-model').first().getByTestId('group-yoghurt').locator('.model-node').click({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  const table = page.getByTestId('attribute-table')
  await expect(table).toContainText('Fat content')
  await expect(table).toContainText('from Dairy')
  await expect(table.getByTestId('table-add-row')).toBeVisible()
})

test('type attributes reorder and checkbox persist after reload', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const definitions = (await (await page.request.get('/v1/definitions')).json()) as {
    types: Array<{ key: string; kind?: string; attributes?: unknown[] }>
    attributes: Array<{ id: string; key: string; kind?: { type?: string } }>
  }
  const standard = new Set([
    '018f0000-0000-7000-8000-000000000100',
    '018f0000-0000-7000-8000-000000000101',
    '018f0000-0000-7000-8000-00000000a003',
    '018f0000-0000-7000-8000-00000000a004',
    '018f0000-0000-7000-8000-00000000a005',
  ])
  const byToken = new Map<string, { id: string; key: string; kind?: { type?: string } }>()
  for (const attribute of definitions.attributes) {
    byToken.set(String(attribute.id), attribute)
    byToken.set(String(attribute.key), attribute)
  }
  const chosen = definitions.types.find((type) => {
    if (type.kind === 'link') return false
    const own = (type.attributes ?? [])
      .map((token) => byToken.get(String(token)))
      .filter((attribute): attribute is { id: string; key: string; kind?: { type?: string } } => Boolean(attribute))
      .filter((attribute) => !standard.has(String(attribute.id)))
    return own.length >= 2 && own.some((attribute) => attribute.kind?.type === 'boolean')
  })
  expect(chosen, 'object type with boolean attributes').toBeTruthy()
  const own = (chosen?.attributes ?? [])
    .map((token) => byToken.get(String(token)))
    .filter((attribute): attribute is { id: string; key: string; kind?: { type?: string } } => Boolean(attribute))
    .filter((attribute) => !standard.has(String(attribute.id)))
  const first = own[0]
  const second = own[1]
  const boolean = own.find((attribute) => attribute.kind?.type === 'boolean')
  if (!chosen || !first || !second || !boolean) throw new Error('missing type attributes')

  const openAttributes = async () => {
    await page.getByRole('button', { name: 'Data model' }).click()
    const objectTypesTab = page.locator('.pane-tab', { hasText: 'Object types' }).first()
    await expect(objectTypesTab).toBeVisible({ timeout: 30_000 })
    await objectTypesTab.click()
    const typeTable = page.getByTestId('object-types-table')
    const typeRow = typeTable.locator(`[data-row-id="${chosen.key}"]`)
    await expect(async () => {
      await typeRow.click({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
    await expect(page.getByTestId('attribute-table')).toBeVisible()
  }

  await openAttributes()
  const table = page.getByTestId('attribute-table')
  await expect(table.locator(`[data-row-id="${first.id}"]`)).toBeVisible()
  await table.locator(`[data-row-id="${first.id}"]`).getByLabel('Move row down').click()

  const checkbox = table.locator(`[data-row-id="${boolean.id}"]`).getByRole('checkbox', { name: 'Searchable' })
  const expected = !(await checkbox.isChecked())
  await checkbox.click()

  const save = table.getByTestId('review-and-save')
  await expect(save).toHaveText('Save')
  const saved = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await save.click()
  expect((await saved).ok()).toBeTruthy()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

  await page.reload()
  await openAttributes()
  const reloaded = page.getByTestId('attribute-table')
  const order = await reloaded.locator('[data-row-id]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-row-id')),
  )
  expect(order.filter((id) => id === first.id || id === second.id)).toEqual([second.id, first.id])
  const persisted = reloaded.locator(`[data-row-id="${boolean.id}"]`).getByRole('checkbox', { name: 'Searchable' })
  if (expected) await expect(persisted).toBeChecked()
  else await expect(persisted).not.toBeChecked()
})

test('allowed trees open the review dialog before saving', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const definitions = (await (await page.request.get('/v1/definitions')).json()) as {
    types: Array<{ id: string; key: string; kind?: string; structures?: unknown[] }>
    structures: Array<{ id: string; key: string; labels?: Record<string, string> }>
  }
  const structure = definitions.structures[0]
  if (!structure) throw new Error('missing structure')
  const structureId = String(structure.id)
  const structureKey = String(structure.key)
  const structureLabel = structure.labels?.en || structureKey
  const hasStructure = (type: { structures?: unknown[] }) =>
    (type.structures ?? []).map(String).some((token) => token === structureId || token === structureKey)
  const objectTypes = definitions.types.filter((type) => type.kind !== 'link')
  const chosen = objectTypes.find((type) => !hasStructure(type)) ?? objectTypes[0]
  if (!chosen) throw new Error('missing object type')
  const initiallyAllowed = hasStructure(chosen)
  const expected = !initiallyAllowed

  const openAttributes = async () => {
    await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
    const objectTypesTab = page.locator('.pane-tab', { hasText: 'Object types' }).first()
    await expect(objectTypesTab).toBeVisible({ timeout: 30_000 })
    await objectTypesTab.click()
    const typeRow = page.getByTestId('object-types-table').locator(`[data-row-id="${chosen.key}"]`)
    await expect(async () => {
      await typeRow.click({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
    await expect(page.getByTestId('attribute-table')).toBeVisible()
  }

  const persisted = async () => {
    const body = (await (await page.request.get('/v1/definitions')).json()) as {
      types: Array<{ key: string; structures?: unknown[] }>
    }
    const type = body.types.find((item) => item.key === chosen.key)
    return (type?.structures ?? []).map(String).some((token) => token === structureId || token === structureKey)
  }

  let savePosts = 0
  let directPut = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/model/draft/save')) savePosts += 1
    if (request.method() === 'PUT' && /\/v1\/(types|structures)/.test(request.url())) directPut += 1
  })

  await openAttributes()
  const trees = page.getByTestId('allowed-trees')
  const checkbox = trees.getByRole('checkbox', { name: structureLabel, exact: true })
  if (initiallyAllowed) await expect(checkbox).toBeChecked()
  else await expect(checkbox).not.toBeChecked()

  await checkbox.click()
  const dialog = page.getByTestId('review-dialog')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  const confirm = dialog.getByTestId('confirm-review')
  await expect(confirm).toHaveText('Save')
  await expect(confirm).not.toHaveClass(/btn-danger/)
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
  expect(savePosts).toBe(0)
  expect(directPut).toBe(0)
  expect(await persisted()).toBe(initiallyAllowed)

  const save = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await confirm.click()
  expect((await save).ok()).toBeTruthy()
  expect(savePosts).toBe(1)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
  await expect.poll(persisted).toBe(expected)

  await page.reload()
  await openAttributes()
  const reloaded = page.getByTestId('allowed-trees').getByRole('checkbox', { name: structureLabel, exact: true })
  if (expected) await expect(reloaded).toBeChecked()
  else await expect(reloaded).not.toBeChecked()

  // Put the type back through the same Review path so no draft is left behind.
  await reloaded.click()
  const restore = page.getByTestId('review-dialog')
  await expect(restore).toBeVisible({ timeout: 10_000 })
  const restoreSave = page.waitForResponse((response) =>
    response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
  await restore.getByTestId('confirm-review').click()
  expect((await restoreSave).ok()).toBeTruthy()
  expect(savePosts).toBe(2)
  await expect(restore).toHaveCount(0)
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
  await expect.poll(persisted).toBe(initiallyAllowed)

  await page.reload()
  await openAttributes()
  const restored = page.getByTestId('allowed-trees').getByRole('checkbox', { name: structureLabel, exact: true })
  if (initiallyAllowed) await expect(restored).toBeChecked()
  else await expect(restored).not.toBeChecked()
})
