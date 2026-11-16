import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { focusMainTable, mainTable } from './ui'

type ColumnPrefsDocument = {
  version?: number
  columns?: Array<{ path: string; visible?: boolean }>
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  const tab = page.locator('nav.tabs').getByRole('button', { name: /^Products/ })
  await tab.click()
  await expect(tab).toHaveClass(/active/)
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

async function readProductsColumnPrefs(page: Page): Promise<{ viewId: string; document: ColumnPrefsDocument }> {
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

  const prefs = await page.request.get(
    `/v1/views/${table.id}/column-prefs?environment=default`,
  )
  if (!prefs.ok()) throw new Error(`column prefs read: HTTP ${prefs.status()}`)
  const body = (await prefs.json()) as { document?: ColumnPrefsDocument }
  return { viewId: table.id, document: body.document ?? { version: 2, columns: [] } }
}

async function restoreProductsColumnPrefs(page: Page, snapshot: { viewId: string; document: ColumnPrefsDocument }) {
  const seeded = await page.request.put(
    `/v1/views/${snapshot.viewId}/column-prefs?environment=default`,
    {
      data: {
        environment: 'default',
        document: snapshot.document,
      },
    },
  )
  if (!seeded.ok()) throw new Error(`column prefs restore: HTTP ${seeded.status()}`)
}

test.describe('unit field single choice in Select fields', () => {
  test.setTimeout(180_000)

  let prefsSnapshot: { viewId: string; document: ColumnPrefsDocument } | null = null

  test.afterEach(async ({ page }) => {
    if (!prefsSnapshot) return
    try {
      await restoreProductsColumnPrefs(page, prefsSnapshot)
    } catch (error) {
      console.error('column prefs cleanup failed:', error)
    } finally {
      prefsSnapshot = null
    }
  })

  test('Protein g → kg: one radio checked, header updates, persists after reload', async ({ page }) => {
    await login(page)
    await openProducts(page)
    prefsSnapshot = await readProductsColumnPrefs(page)

    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Protein')
    await enterOn(page, 'fields-row-protein')

    await expect(page.getByTestId('fields-check-g')).toHaveAttribute('data-choice', 'radio')
    await expect(page.getByTestId('fields-check-kg')).toHaveAttribute('data-choice', 'radio')

    const savedG = page.waitForResponse(
      (response) => response.url().includes('/column-prefs') && response.request().method() === 'PUT',
    )
    await enterOn(page, 'fields-row-g')
    await savedG
    await page.keyboard.press('Escape')

    const headerG = mainTable(page).locator('.head [data-testid="col-protein#unit:g"]')
    await expect(headerG).toBeVisible()
    await expect(headerG).toContainText('Protein')
    await expect(headerG).toContainText('g')

    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Protein')
    await enterOn(page, 'fields-row-protein')
    await expect(page.getByTestId('fields-check-g')).toHaveAttribute('data-state', 'checked')
    await expect(page.getByTestId('fields-check-kg')).toHaveAttribute('data-state', 'unchecked')

    const savedKg = page.waitForResponse(
      (response) => response.url().includes('/column-prefs') && response.request().method() === 'PUT',
    )
    await enterOn(page, 'fields-row-kg')
    await savedKg
    await expect(page.getByTestId('fields-check-g')).toHaveAttribute('data-state', 'unchecked')
    await expect(page.getByTestId('fields-check-kg')).toHaveAttribute('data-state', 'checked')
    await page.keyboard.press('Escape')

    const headerKg = mainTable(page).locator('.head [data-testid="col-protein#unit:kg"]')
    await expect(headerKg).toBeVisible()
    await expect(headerKg).toContainText('Protein')
    await expect(headerKg).toContainText('kg')
    await expect(mainTable(page).locator('.head [data-testid="col-protein#unit:g"]')).toHaveCount(0)

    await page.reload()
    await expect(mainTable(page)).toBeVisible({ timeout: 60_000 })
    await expect(mainTable(page).getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    await expect(mainTable(page).locator('.head [data-testid="col-protein#unit:kg"]')).toBeVisible()
    await expect(mainTable(page).locator('.head [data-testid="col-protein#unit:g"]')).toHaveCount(0)

    // K2: re-selecting the active unit must never leave two units checked (toggle-off is OK).
    await openFieldsPalette(page)
    await page.getByTestId('fields-mode-input').fill('Protein')
    await enterOn(page, 'fields-row-protein')
    await expect(page.getByTestId('fields-check-kg')).toHaveAttribute('data-state', 'checked')
    await enterOn(page, 'fields-row-kg')
    await expect(page.getByTestId('fields-check-g')).toHaveAttribute('data-state', 'unchecked')
    const gChecked = (await page.getByTestId('fields-check-g').getAttribute('data-state')) === 'checked'
    const kgChecked = (await page.getByTestId('fields-check-kg').getAttribute('data-state')) === 'checked'
    expect(gChecked && kgChecked).toBe(false)
    await page.keyboard.press('Escape')
  })
})