import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row242-shots')
mkdirSync(shots, { recursive: true })

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

type WorkspaceDetail = {
  id: string
  views: Array<{
    id: string
    type: string
    title: string
    state: { table?: { filter?: string } }
  }>
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function getWorkspace(page: Page, id: string): Promise<WorkspaceDetail> {
  const response = await page.request.get(`/v1/workspaces/${id}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as WorkspaceDetail
}

/** Create a throwaway single-table Products workspace via the API so closing
 * and reopening a view never edits the canonical Products layout shared by
 * other specs. The seeded product rows feed the table, so no objects are
 * inserted. */
async function createProductsWorkspace(
  page: Page,
): Promise<{ id: string; name: string; viewId: string }> {
  const id = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  const suffix = id.slice(0, 8)
  const name = `Row242 search ${suffix}`
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id,
      name,
      locked: false,
      share_token: `row242-search-${suffix}`,
      layout: { type: 'tabs', views: [viewId], active: 0 },
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()

  const view = await page.request.post('/v1/views', {
    data: {
      id: viewId,
      workspace_id: id,
      type: 'object_table',
      title: 'Products',
      pane: 'main',
      position: 0,
      state: {
        columns: ['number', 'name', 'status'],
        sort: 'number',
        object_type: PRODUCT_TYPE_ID,
        type_key: 'product',
      },
    },
  })
  expect(view.ok(), `create Products view ${view.status()}`).toBeTruthy()
  return { id, name, viewId }
}

async function openWorkspaceTab(page: Page, name: string) {
  const tab = page.locator('nav.tabs button.tab').filter({ hasText: name }).first()
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  const table = mainTable(page)
  await expect(table).toBeVisible({ timeout: 30_000 })
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  return table
}

async function reloadDock(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function waitForSearch(page: Page, text: string) {
  return page.waitForResponse(
    (response) => response.url().includes('/v1/search') && response.url().includes(text) && response.ok(),
    { timeout: 30_000 },
  )
}

async function openClosedView(page: Page, title: string) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('Open view')
  const root = palette.getByRole('option', { name: /^Open view/ }).first()
  await expect(root).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
  await palette.getByTestId('palette-input').fill(title)
  const option = palette.getByRole('option', { name: new RegExp(`^${title}`) }).first()
  await expect(option).toBeVisible()
  await option.click()
  await expect(palette).toHaveCount(0)
}

function productsTable(workspace: WorkspaceDetail) {
  return workspace.views.find((item) => item.type === 'object_table' && item.title === 'Products')
}

async function storedFilter(page: Page, workspaceId: string): Promise<string | undefined> {
  const workspace = await getWorkspace(page, workspaceId)
  return productsTable(workspace)?.state.table?.filter
}

test('Products search is not silently restored when the view is reopened', async ({ page }) => {
  // The budget covers an API-created Products workspace plus close/reopen and reload.
  test.setTimeout(300_000)
  await login(page)

  let workspaceId = ''
  try {
    const workspace = await createProductsWorkspace(page)
    workspaceId = workspace.id
    await reloadDock(page)
    const table = await openWorkspaceTab(page, workspace.name)
    const quick = table.getByTestId('quick-filter')
    const rows = table.getByTestId('object-row')
    const empty = table.getByTestId('object-table-empty')
    const view = productsTable(await getWorkspace(page, workspace.id))
    if (!view) throw new Error('workspace has no Products object table view')
    expect(view.id).toBe(workspace.viewId)

    // 1. An in-session query that matches nothing names itself and can be cleared.
    const noMatch = `ROW242-NO-MATCH-${Date.now()}`
    const noMatchSearch = waitForSearch(page, noMatch)
    await quick.fill(noMatch)
    await noMatchSearch
    await expect(empty).toBeVisible({ timeout: 30_000 })
    await expect(empty).toContainText(noMatch)
    const clear = table.getByTestId('clear-search')
    await expect(clear).toBeVisible()
    await page.screenshot({ path: `${shots}/row242-01-empty-state-named-query.png` })

    await clear.click()
    await expect(quick).toHaveValue('')
    await expect(rows.first()).toBeVisible({ timeout: 60_000 })

    // 2. A query long enough for the old 400 ms view save must not be stored.
    const stale = `ROW242-STALE-${Date.now()}`
    const staleSearch = waitForSearch(page, stale)
    await quick.fill(stale)
    await staleSearch
    await expect(empty).toContainText(stale)
    await page.waitForTimeout(700)
    expect(await storedFilter(page, workspace.id)).toBe('')

    // Close and reopen the view: the box starts empty and the rows come back.
    await page.getByTestId(`close-tab-${view.id}`).click()
    await expect(page.locator(`[data-tab="${view.id}"]`)).toHaveCount(0)
    await openClosedView(page, view.title)
    const reopened = mainTable(page)
    await expect(reopened).toBeVisible({ timeout: 30_000 })
    await expect(reopened.getByTestId('quick-filter')).toHaveValue('')
    await expect(reopened.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await page.screenshot({ path: `${shots}/row242-02-reopened-full-table-empty-search.png` })

    // 3. Reload rehydrates the view row. A stale search must still not come back.
    // Use a fresh query: reusing `stale` here can be served from the React Query
    // cache, so no new /v1/search request would ever arrive.
    const reloadQuery = `ROW242-RELOAD-${Date.now()}`
    const reloadSearch = waitForSearch(page, reloadQuery)
    await reopened.getByTestId('quick-filter').fill(reloadQuery)
    await reloadSearch
    await expect(reopened.getByTestId('object-table-empty')).toContainText(reloadQuery)
    await page.waitForTimeout(700)
    expect(await storedFilter(page, workspace.id)).toBe('')

    await reloadDock(page)
    const afterReload = await openWorkspaceTab(page, workspace.name)
    await expect(afterReload.getByTestId('quick-filter')).toHaveValue('')
    await expect(afterReload.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  } finally {
    if (workspaceId) {
      try {
        await page.request.delete(`/v1/workspaces/${workspaceId}`)
      } catch {
        // The page or context may already be gone; the run is isolated anyway.
      }
    }
  }
})
