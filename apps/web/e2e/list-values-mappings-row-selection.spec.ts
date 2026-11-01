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

/** Body rows: class is always set; testid may be overridden (import mappings). */
function gridRows(page: Page, tableTestId: string) {
  return page.getByTestId(tableTestId).locator('.standard-grid-row')
}

async function openWorkspaceTab(
  page: Page,
  workspace: string,
  label: string,
  tableTestId: string,
) {
  await page.getByRole('button', { name: workspace }).click()
  const tab = page.locator('.pane-tab').filter({ hasText: label }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  const table = page.getByTestId(tableTestId)
  await expect(table).toBeVisible()
  await expect(gridRows(page, tableTestId).first()).toBeVisible()
}

async function activateRow(row: ReturnType<ReturnType<Page['locator']>['nth']>) {
  // Prefer the name cell so a trailing action button (Delete) does not swallow the click.
  const nameCell = row.locator('[data-column="name"], [data-column="label"]').first()
  if ((await nameCell.count()) > 0) {
    await nameCell.click()
  } else {
    await row.click({ position: { x: 24, y: 10 } })
  }
}

async function assertRowSelection(page: Page, tableTestId: string) {
  const rows = gridRows(page, tableTestId)
  await expect(rows.first()).toBeVisible()
  const count = await rows.count()
  expect(count).toBeGreaterThan(1)

  await activateRow(rows.nth(0))
  await expect(rows.nth(0)).toHaveClass(/\bon\b/)

  await rows.nth(0).focus()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(1)).toHaveClass(/\bon\b/)
  await expect(rows.nth(0)).not.toHaveClass(/\bon\b/)

  await page.keyboard.press('ArrowUp')
  await expect(rows.nth(0)).toHaveClass(/\bon\b/)
  await expect(rows.nth(1)).not.toHaveClass(/\bon\b/)
}

/** Seeded Review workspaces may omit Import mappings; give the test its own pane. */
async function seedImportMappingsWorkspace(page: Page, name: string) {
  const workspaceId = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  const layout = {
    type: 'tabs',
    views: [viewId],
    active: 0,
  }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name,
      locked: false,
      share_token: `user-e2e-mappings-${workspaceId.slice(0, 8)}`,
      layout,
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()
  const view = await page.request.post('/v1/views', {
    data: {
      id: viewId,
      workspace_id: workspaceId,
      type: 'import_mappings',
      title: 'Import mappings',
      pane: 'main',
      position: 0,
      state: {},
    },
  })
  expect(view.ok(), `create view ${view.status()}`).toBeTruthy()
  return { workspaceId, name }
}

test('List values shows purple active row on click and arrow keys', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openWorkspaceTab(page, 'Data model', 'Value lists', 'value-lists-table')

  // Activate Status so List values loads that list's options (draft/ok/discontinued).
  const lists = gridRows(page, 'value-lists-table')
  const status = lists.filter({ hasText: 'Status' }).first()
  await expect(status).toBeVisible()
  await status.click()

  await openWorkspaceTab(page, 'Data model', 'List values', 'value-list-values-table')
  await assertRowSelection(page, 'value-list-values-table')
})

test('Import mappings shows purple active row on click and arrow keys', async ({ page }) => {
  test.setTimeout(120_000)
  await page.route('**/v1/import-mappings', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mappings: [
          {
            id: '018f0000-0000-7000-8000-00000000a001',
            name: 'Food CSV',
            type: 'product',
            headers: ['GTIN', 'Name'],
            columns: [{ header: 'GTIN', target: 'gtin' }],
            empty_clears: false,
          },
          {
            id: '018f0000-0000-7000-8000-00000000a002',
            name: 'SAP export',
            type: 'product',
            headers: ['Article', 'Label'],
            columns: [{ header: 'Article', target: 'key' }],
            empty_clears: false,
          },
        ],
      }),
    })
  })

  await login(page)
  const name = `Mappings select ${crypto.randomUUID().slice(0, 8)}`
  await seedImportMappingsWorkspace(page, name)
  await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
  const workspaceTab = page.locator('nav.tabs').getByRole('button', {
    name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  })
  await expect(workspaceTab).toBeVisible({ timeout: 30_000 })
  await workspaceTab.click()
  await openWorkspaceTab(page, name, 'Import mappings', 'import-mappings')
  await assertRowSelection(page, 'import-mappings')
})
