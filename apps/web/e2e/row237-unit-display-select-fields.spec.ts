import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { focusMainTable, mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  await expect(mainTable(page).getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
}

async function openFieldsPalette(page: Page) {
  await focusMainTable(page)
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('Select fields')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('fields-mode')).toBeVisible()
}

async function enterOn(page: Page, rowTestId: string) {
  await expect(page.getByTestId(rowTestId)).toBeVisible()
  for (let i = 0; i < 120; i += 1) {
    const active = page.locator('[data-testid="fields-mode"] [data-active="true"]')
    const activeId = await active.getAttribute('data-testid')
    if (activeId === rowTestId) {
      await page.keyboard.press('Enter')
      return
    }
    const activeBox = await active.boundingBox()
    const targetBox = await page.getByTestId(rowTestId).boundingBox()
    if (activeBox && targetBox && targetBox.y + 1 < activeBox.y) {
      await page.keyboard.press('ArrowUp')
    } else {
      await page.keyboard.press('ArrowDown')
    }
  }
  throw new Error(`Could not move active highlight to ${rowTestId}`)
}

function cheddarRow(page: Page) {
  return mainTable(page).getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
}

async function cheddarObjectId(page: Page) {
  const row = cheddarRow(page)
  const objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(objectId).not.toBe('')
  return objectId
}

type MeasureValue = { value?: unknown; unit?: unknown }

async function readEnergy(page: Page, objectId: string): Promise<MeasureValue | undefined> {
  const response = await page.request.get(`/v1/objects/${objectId}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { values?: { energy?: MeasureValue } }
  return body.values?.energy
}

async function restoreProductsColumnPrefs(page: Page) {
  const listed = await page.request.get('/v1/workspaces')
  if (!listed.ok()) throw new Error(`workspaces: HTTP ${listed.status()}`)
  const { workspaces } = (await listed.json()) as {
    workspaces: Array<{ id: string; name: string }>
  }
  const products = workspaces.find((item) => item.name === 'Products')
  if (!products) throw new Error('missing workspace Products')
  const workspace = await page.request.get(`/v1/workspaces/${products.id}`)
  if (!workspace.ok()) throw new Error(`workspace: HTTP ${workspace.status()}`)
  const { views } = (await workspace.json()) as {
    views: Array<{
      id: string
      type: string
      title?: string
      state?: { type_key?: string; object_type?: string }
    }>
  }
  const productTypeId = '018f0000-0000-7000-8000-000000000200'
  const isTable = (view: { type: string }) => view.type === 'object_table' || view.type === 'table'
  const isProduct = (view: {
    title?: string
    state?: { type_key?: string; object_type?: string }
  }) =>
    view.state?.object_type === productTypeId ||
    view.state?.type_key === productTypeId ||
    view.title === 'Products'
  const table = views.find((view) => isTable(view) && isProduct(view)) ?? views.find(isTable)
  if (!table) throw new Error('missing Products object table')
  const seeded = await page.request.put(
    `/v1/views/${table.id}/column-prefs?environment=default`,
    {
      data: {
        environment: 'default',
        document: {
          version: 2,
          columns: [
            { path: 'number', visible: true },
            { path: 'name', visible: true },
            { path: 'brand', visible: true },
            { path: 'status', visible: true },
          ],
        },
      },
    },
  )
  if (!seeded.ok()) throw new Error(`column prefs seed: HTTP ${seeded.status()}`)
}

async function restoreEnergy(page: Page, objectId: string, snapshot: MeasureValue | undefined) {
  if (!snapshot) return
  const current = await page.request.get(`/v1/objects/${objectId}`)
  if (!current.ok()) return
  const version = (await current.json()) as { version?: number }
  await page.request.patch(`/v1/objects/${objectId}`, {
    headers: { 'If-Match': String(version.version ?? 0) },
    data: { values: { energy: snapshot } },
  })
}

test.describe('row 237 unit display and Select fields', () => {
  test.afterEach(async ({ page }) => {
    try {
      await restoreProductsColumnPrefs(page)
    } catch (error) {
      console.error('column prefs cleanup failed:', error)
    }
  })

  test('converted measures are rounded and unit headers keep casing', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Energy')
    await enterOn(page, 'fields-row-energy')
    await page.getByTestId('fields-mode-input').fill('')
    await enterOn(page, 'fields-row-kcal')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('fields-mode')).toHaveCount(0)

    const headerKcal = mainTable(page).locator('.head [data-testid^="col-energy"]').first()
    await expect(headerKcal).toBeVisible()
    await expect(headerKcal).toContainText('Energy')
    await expect(headerKcal).toContainText('kcal')

    const cell = cheddarRow(page).locator('[data-testid^="path-cell-energy"]')
    await expect(cell).toBeVisible()
    const text = ((await cell.textContent()) ?? '').trim()
    expect(text).toMatch(/^\d{1,3}(,\d{3})*(\.\d{1,2})? kcal$/)
    expect(text).not.toMatch(/\d+\.\d{3,}/)

    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Energy')
    await enterOn(page, 'fields-row-energy')
    await page.getByTestId('fields-mode-input').fill('')
    await enterOn(page, 'fields-row-kJ')
    await page.keyboard.press('Escape')

    const headerKj = mainTable(page).locator('.head [data-testid*="unit:kJ"], .head [data-testid*="unit:kj"]').first()
    await expect(headerKj).toBeVisible()
    await expect(headerKj).toContainText('Energy (kJ)')
    await expect(headerKj).not.toContainText('(kj)')
  })

  test('Enter with an empty Select fields filter does not toggle columns', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(mainTable(page).locator('.head [data-testid="col-number"]').first()).toBeVisible()
    await openFieldsPalette(page)
    await expect(page.getByTestId('fields-check-number')).toHaveAttribute('data-state', 'checked')
    await page.getByTestId('fields-mode-input').fill('')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('fields-check-number')).toHaveAttribute('data-state', 'checked')
    await page.keyboard.press('Escape')
    await expect(mainTable(page).locator('.head [data-testid="col-number"]').first()).toBeVisible()
  })

  test('Enter still toggles when the filter matches a field', async ({ page }) => {
    await login(page)
    await openProducts(page)
    const brandHeader = mainTable(page).locator('.head [data-testid="col-brand"]').first()
    const wasVisible = await brandHeader.isVisible()
    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('brand')
    await enterOn(page, 'fields-row-brand')
    await page.keyboard.press('Escape')
    if (wasVisible) {
      await expect(brandHeader).toHaveCount(0)
    } else {
      await expect(brandHeader).toBeVisible()
    }
  })

  test('inline converted energy edit keeps stored precision', async ({ page }) => {
    test.setTimeout(180_000)
    const patches: string[] = []
    await page.route('**/v1/objects/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        patches.push(route.request().postData() ?? '')
      }
      await route.continue()
    })

    await login(page)
    await openProducts(page)
    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Energy')
    await enterOn(page, 'fields-row-energy')
    await page.getByTestId('fields-mode-input').fill('')
    await enterOn(page, 'fields-row-kcal')
    await page.keyboard.press('Escape')

    const objectId = await cheddarObjectId(page)
    const energyBefore = await readEnergy(page, objectId)
    expect(energyBefore?.unit).toBe('kJ')

    const energyCell = cheddarRow(page).locator('[data-column*="energy"]').first()
    await expect(energyCell).toBeVisible()
    await energyCell.dblclick()
    const editor = page.locator('[data-testid^="cell-editor-energy"]').first()
    await expect(editor).toBeVisible()
    const beforeUnchanged = patches.length
    await editor.press('Enter')
    await expect(editor).toHaveCount(0)
    expect(patches.slice(beforeUnchanged)).toEqual([])
    expect(await readEnergy(page, objectId)).toEqual(energyBefore)

    await energyCell.dblclick()
    await expect(editor).toBeVisible()
    await editor.fill('500 kcal')
    const beforeSave = patches.length
    await editor.press('Enter')
    await mainTable(page).getByTestId('review-and-save').click()
    const dialog = page.getByTestId('review-dialog')
    if (await dialog.isVisible()) {
      await dialog.getByTestId('confirm-review').click()
    }
    await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe('2092')
    expect(patches.length).toBeGreaterThan(beforeSave)
    expect(await readEnergy(page, objectId)).toEqual({ value: '2092', unit: 'kJ' })

    try {
      await restoreEnergy(page, objectId, energyBefore)
    } catch (error) {
      console.error('energy cleanup failed:', error)
    }
  })
})