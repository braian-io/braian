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

async function addEnergyKcalColumn(page: Page) {
  await openFieldsPalette(page)
  await page.getByTestId('fields-mode-input').fill('Energy')
  await enterOn(page, 'fields-row-energy')
  await page.getByTestId('fields-mode-input').fill('')
  await enterOn(page, 'fields-row-kcal')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('fields-mode')).toHaveCount(0)
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

      const kjCell = cheddarRow(page).locator('[data-column*="energy"]').first()
      const kjText = ((await kjCell.textContent()) ?? '').trim()
      expect(kjText).toMatch(/418\.4 kJ/)
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

  test('K4 decimal comma and K5 invalid input feedback in the grid', async ({ page }) => {
    test.setTimeout(120_000)
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
      await valueInput.fill('1,5')
      await valueInput.press('Enter')
      await saveDraftIfNeeded(page)
      await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).not.toBe(
        energyBefore?.value,
      )

      await cell.dblclick()
      await expect(valueInput).toBeVisible()
      await valueInput.fill('abc')
      await valueInput.press('Enter')
      await expect(valueInput).toBeVisible()
      await expect(valueInput).toHaveAttribute('aria-invalid', 'true')

      await valueInput.fill('')
      await valueInput.press('Enter')
      await expect(valueInput).toBeVisible()
      await expect(valueInput).toHaveAttribute('aria-invalid', 'true')
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

      const valueInput = page.getByTestId('detail-measure-value')
      await expect(valueInput).toBeVisible()
      await valueInput.fill('2000')
      const unitTrigger = page.locator('[data-testid="detail-measure-field"] .unit-suffix').first()
      await unitTrigger.click()
      await page.getByRole('option', { name: 'kJ' }).click()
      await expect(valueInput).toHaveValue('2000')
      await page.getByTestId('detail-measure-value').press('Tab')

      const save = page.getByTestId('review-and-save')
      if (await save.isVisible()) {
        await save.click()
        const dialog = page.getByTestId('review-dialog')
        if (await dialog.isVisible()) {
          await dialog.getByTestId('confirm-review').click()
        }
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