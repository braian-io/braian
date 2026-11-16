import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { focusMainTable, mainTable } from './ui'

type MeasureValue = { value?: unknown; unit?: unknown }

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

async function readEnergy(page: Page, objectId: string): Promise<MeasureValue | undefined> {
  const response = await page.request.get(`/v1/objects/${objectId}`, { timeout: apiTimeout })
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { values?: { energy?: MeasureValue } }
  return body.values?.energy
}

const apiTimeout = 15_000

async function restoreProductsColumnPrefs(page: Page) {
  const listed = await page.request.get('/v1/workspaces', { timeout: apiTimeout })
  if (!listed.ok()) throw new Error(`workspaces: HTTP ${listed.status()}`)
  const { workspaces } = (await listed.json()) as {
    workspaces: Array<{ id: string; name: string }>
  }
  const products = workspaces.find((item) => item.name === 'Products')
  if (!products) throw new Error('missing workspace Products')
  const workspace = await page.request.get(`/v1/workspaces/${products.id}`, { timeout: apiTimeout })
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
      timeout: apiTimeout,
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
  const current = await page.request.get(`/v1/objects/${objectId}`, { timeout: apiTimeout })
  if (!current.ok()) return
  const version = (await current.json()) as { version?: number }
  await page.request.patch(`/v1/objects/${objectId}`, {
    headers: { 'If-Match': String(version.version ?? 0) },
    timeout: apiTimeout,
    data: { values: { energy: snapshot } },
  })
}

async function addEnergyKcalColumn(page: Page) {
  await openFieldsPalette(page)
  await page.getByTestId('fields-mode-input').fill('Energy')
  await enterOn(page, 'fields-row-energy')
  await page.getByTestId('fields-mode-input').fill('')
  await enterOn(page, 'fields-row-kcal')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('fields-mode')).toHaveCount(0)
}

async function addBareEnergyColumn(page: Page) {
  const listed = await page.request.get('/v1/workspaces', { timeout: apiTimeout })
  if (!listed.ok()) throw new Error(`workspaces: HTTP ${listed.status()}`)
  const { workspaces } = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
  const products = workspaces.find((item) => item.name === 'Products')
  if (!products) throw new Error('missing workspace Products')
  const workspace = await page.request.get(`/v1/workspaces/${products.id}`, { timeout: apiTimeout })
  if (!workspace.ok()) throw new Error(`workspace: HTTP ${workspace.status()}`)
  const { views } = (await workspace.json()) as {
    views: Array<{ id: string; type: string; title?: string; state?: { object_type?: string } }>
  }
  const productTypeId = '018f0000-0000-7000-8000-000000000200'
  const table =
    views.find(
      (view) =>
        (view.type === 'object_table' || view.type === 'table')
        && (view.state?.object_type === productTypeId || view.title === 'Products'),
    ) ?? views.find((view) => view.type === 'object_table' || view.type === 'table')
  if (!table) throw new Error('missing Products object table')
  const seeded = await page.request.put(`/v1/views/${table.id}/column-prefs?environment=default`, {
    timeout: apiTimeout,
    data: {
      environment: 'default',
      document: {
        version: 2,
        columns: [
          { path: 'number', visible: true },
          { path: 'name', visible: true },
          { path: 'energy', visible: true, qualifiers: [] },
        ],
      },
    },
  })
  if (!seeded.ok()) throw new Error(`column prefs seed energy: HTTP ${seeded.status()}`)
  await page.reload()
  await openProducts(page)
}

async function replaceMeasureInput(
  input: ReturnType<Page['locator']>,
  text: string,
) {
  await expect(input).toBeVisible()
  await input.focus()
  await input.evaluate((element) => {
    const field = element as HTMLInputElement
    field.setSelectionRange(0, field.value.length)
  })
  await input.pressSequentially(text, { delay: 0 })
  await expect(input).toHaveValue(text)
}

async function saveDraftIfNeeded(page: Page) {
  const save = mainTable(page).getByTestId('review-and-save')
  if (await save.isVisible()) {
    await save.click()
    const dialog = page.getByTestId('review-dialog')
    if (await dialog.isVisible()) {
      await dialog.getByTestId('confirm-review').click()
    }
  }
}

test.describe('measure unit inline edit', () => {
  test('K1–K3 grid editor splits number and unit, converts on save, no float noise', async ({ page }) => {
    test.setTimeout(180_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      await openProducts(page)
      await addEnergyKcalColumn(page)

      objectId = await cheddarObjectId(page)
      energyBefore = await readEnergy(page, objectId)

      const cell = cheddarRow(page).locator('[data-column*="energy"]').first()
      await cell.dblclick()
      const valueInput = page.locator('[data-testid^="cell-editor-energy"][data-testid$="-value"]').first()
      const unitLabel = page.locator('[data-testid^="cell-editor-energy"][data-testid$="-unit"]').first()
      await expect(valueInput).toBeVisible()
      await expect(unitLabel).toBeVisible()
      await expect(unitLabel).toContainText('kcal')
      await expect(valueInput).not.toHaveValue(/.+kcal/)

      await valueInput.fill('100')
      await valueInput.press('Enter')
      await saveDraftIfNeeded(page)
      await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe('418.4')
      expect(await readEnergy(page, objectId)).toEqual({ value: '418.4', unit: 'kJ' })

      await openFieldsPalette(page)
      await page.getByTestId('fields-mode-input').fill('Energy')
      await enterOn(page, 'fields-row-energy')
      await page.getByTestId('fields-mode-input').fill('')
      await enterOn(page, 'fields-row-kJ')
      await page.keyboard.press('Escape')

      const kjCell = cheddarRow(page).locator('[data-testid="path-cell-energy#unit:kJ"]')
      await expect(kjCell).toBeVisible({ timeout: 60_000 })
      await expect.poll(async () => ((await kjCell.textContent()) ?? '').trim(), { timeout: 60_000 }).toMatch(
        /418\.4 kJ/,
      )
      const kjText = ((await kjCell.textContent()) ?? '').trim()
      expect(kjText).not.toMatch(/418\.40000000000003/)
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
      try {
        await restoreProductsColumnPrefs(page)
      } catch (error) {
        console.error('column prefs cleanup failed:', error)
      }
    }
  })

  test('K5 Escape cancels grid edit; Tab commits; invalid feedback', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    const patches: string[] = []
    try {
      await page.route('**/v1/objects/*', async (route) => {
        if (route.request().method() === 'PATCH') patches.push(route.request().postData() ?? '')
        await route.continue()
      })
      await login(page)
      await openProducts(page)
      await addEnergyKcalColumn(page)
      objectId = await cheddarObjectId(page)
      energyBefore = await readEnergy(page, objectId)
      const beforeValue = energyBefore?.value

      const cell = cheddarRow(page).locator('[data-column*="energy"]').first()
      const editor = () => page.locator('[data-testid^="cell-editor-energy"][data-testid$="-value"]').first()

      await cell.dblclick()
      const cancelInput = editor()
      await expect(cancelInput).toBeVisible()
      await replaceMeasureInput(cancelInput, '1,5')
      await cancelInput.press('Escape')
      await expect(cancelInput).toHaveCount(0)
      expect(patches).toHaveLength(0)
      expect((await readEnergy(page, objectId))?.value).toBe(beforeValue)

      await focusMainTable(page)
      await cell.dblclick()
      const tabInput = editor()
      await replaceMeasureInput(tabInput, '1,5')
      await tabInput.press('Tab')
      await expect(tabInput).toHaveCount(0, { timeout: 30_000 })
      await saveDraftIfNeeded(page)

      await focusMainTable(page)
      await cell.dblclick()
      const invalidInput = editor()
      await invalidInput.fill('abc')
      await invalidInput.press('Enter')
      await expect(invalidInput).toBeVisible()
      await expect(invalidInput).toHaveAttribute('aria-invalid', 'true')
      await invalidInput.fill('')
      await invalidInput.press('Enter')
      await expect(invalidInput).toHaveAttribute('aria-invalid', 'true')
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
      try {
        await restoreProductsColumnPrefs(page)
      } catch (error) {
        console.error('column prefs cleanup failed:', error)
      }
    }
  })

  test('K1 grid pressSequentially comma, dot, and negative values', async ({ page }) => {
    test.setTimeout(180_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    const cases = [
      { typed: '1,5', stored: '6.276' },
      { typed: '12.25', stored: '51.254' },
      { typed: '-3', stored: '-12.552' },
    ] as const
    try {
      await login(page)
      await openProducts(page)
      await addEnergyKcalColumn(page)
      objectId = await cheddarObjectId(page)
      energyBefore = await readEnergy(page, objectId)
      const cell = cheddarRow(page).locator('[data-column*="energy"]').first()
      for (const { typed, stored } of cases) {
        await focusMainTable(page)
        await cell.dblclick()
        const valueInput = page.locator('[data-testid^="cell-editor-energy"][data-testid$="-value"]').first()
        await replaceMeasureInput(valueInput, typed)
        await valueInput.press('Enter')
        await expect(valueInput).toHaveCount(0, { timeout: 30_000 })
        await saveDraftIfNeeded(page)
        await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe(stored)
      }
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
      try {
        await restoreProductsColumnPrefs(page)
      } catch (error) {
        console.error('column prefs cleanup failed:', error)
      }
    }
  })

  test('detail 2000 kJ shows without grouping and unchanged grid edit keeps stored value', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      await openProducts(page)
      objectId = await cheddarObjectId(page)
      energyBefore = await readEnergy(page, objectId)
      const current = await page.request.get(`/v1/objects/${objectId}`, { timeout: apiTimeout })
      const version = (await current.json()) as { version?: number }
      await page.request.patch(`/v1/objects/${objectId}`, {
        headers: { 'If-Match': String(version.version ?? 0) },
        timeout: apiTimeout,
        data: { values: { energy: { value: '2000', unit: 'kJ' } } },
      })

      const row = cheddarRow(page)
      await row.click()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('object-detail')).toBeVisible()
      await expect(page.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')).toHaveValue(
        '2000',
      )

      await addEnergyKcalColumn(page)
      await openFieldsPalette(page)
      await page.getByTestId('fields-mode-input').fill('Energy')
      await enterOn(page, 'fields-row-energy')
      await page.getByTestId('fields-mode-input').fill('')
      await enterOn(page, 'fields-row-kJ')
      await page.keyboard.press('Escape')

      const kjCell = row.locator('[data-testid="path-cell-energy#unit:kJ"]')
      await kjCell.dblclick()
      const valueInput = page.locator('[data-testid="cell-editor-energy#unit:kJ-value"]')
      await expect(valueInput).toHaveValue('2000')
      await valueInput.press('Enter')
      expect(await readEnergy(page, objectId)).toEqual({ value: '2000', unit: 'kJ' })
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
      try {
        await restoreProductsColumnPrefs(page)
      } catch (error) {
        console.error('column prefs cleanup failed:', error)
      }
    }
  })

  test('K4 grid unit selector stays open while choosing unit', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      await openProducts(page)
      await addBareEnergyColumn(page)
      objectId = await cheddarObjectId(page)
      energyBefore = await readEnergy(page, objectId)
      const cell = cheddarRow(page).locator('[data-column="energy"]')
      await expect(cell).toBeVisible({ timeout: 60_000 })
      await focusMainTable(page)
      await cell.dblclick()
      const valueInput = page.getByTestId('cell-editor-energy-value')
      const unitTrigger = page.getByTestId('cell-editor-energy-unit')
      await expect(valueInput).toBeVisible({ timeout: 30_000 })
      await replaceMeasureInput(valueInput, '100')
      await unitTrigger.click()
      await expect(valueInput).toBeVisible()
      await page.getByRole('option', { name: 'kcal' }).click()
      await expect(page.getByTestId('cell-editor-energy-value')).toBeVisible()
      await expect(page.getByTestId('cell-editor-energy-value')).toHaveValue('100')
      await page.getByTestId('cell-editor-energy-value').press('Enter')
      await saveDraftIfNeeded(page)
      expect(Number((await readEnergy(page, objectId))?.value)).toBeCloseTo(418.4, 1)
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
      try {
        await restoreProductsColumnPrefs(page)
      } catch (error) {
        console.error('column prefs cleanup failed:', error)
      }
    }
  })

  test('K1/K2 detail view keeps separate number and unit on unit change', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      await openProducts(page)
      const row = cheddarRow(page)
      await row.click()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('object-detail')).toBeVisible()
      objectId = await cheddarObjectId(page)
      energyBefore = await readEnergy(page, objectId)

      const energyField = page.getByTestId('detail-measure-field-energy')
      const valueInput = energyField.getByTestId('detail-measure-value')
      await expect(valueInput).toBeVisible()
      for (const typed of ['1,5', '12.25', '-3'] as const) {
        await replaceMeasureInput(valueInput, typed)
        await valueInput.blur()
        const expected = typed.includes(',') ? typed.replace(',', '.') : typed
        await expect(valueInput).toHaveValue(expected)
      }
      await replaceMeasureInput(valueInput, '2000')
      const unitTrigger = energyField.locator('.unit-suffix')
      await unitTrigger.click()
      await page.getByRole('option', { name: 'kJ' }).click()
      await expect(valueInput).toHaveValue('2000')
      await valueInput.press('Tab')

      const save = page.getByTestId('object-detail').getByTestId('review-and-save')
      await expect(save).toBeVisible({ timeout: 15_000 })
      await save.click()
      const dialog = page.getByTestId('review-dialog')
      if (await dialog.isVisible()) {
        await dialog.getByTestId('confirm-review').click()
      }
      await expect.poll(async () => (await readEnergy(page, objectId))?.unit, { timeout: 60_000 }).toBe('kJ')
      await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe('2000')
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
    }
  })
})