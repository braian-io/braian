import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row242-shots')
mkdirSync(shots, { recursive: true })

type WorkspaceRow = { id: string; name: string; share_token?: string | null }
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

async function listWorkspaces(page: Page): Promise<WorkspaceRow[]> {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  return ((await listed.json()) as { workspaces: WorkspaceRow[] }).workspaces
}

async function getWorkspace(page: Page, id: string): Promise<WorkspaceDetail> {
  const response = await page.request.get(`/v1/workspaces/${id}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as WorkspaceDetail
}

/** Create a throwaway Products copy so closing and reopening a view never edits
 * the canonical Products layout shared by other specs. */
async function createProductsCopy(page: Page): Promise<{ id: string; name: string }> {
  const before = new Set((await listWorkspaces(page)).map((row) => row.id))
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New from template')
  await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.locator('.crumb')).toContainText('New from template')
  await palette.getByTestId('palette-input').fill('Products')
  const row = palette.getByRole('option', { name: /^Products/ }).first()
  await expect(row).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)

  await expect.poll(async () => {
    return (await listWorkspaces(page)).some((item) => !before.has(item.id))
  }, { timeout: 30_000 }).toBe(true)
  const created = (await listWorkspaces(page)).find((item) => !before.has(item.id))
  if (!created) throw new Error('Products copy was not created')
  expect(created.name).toMatch(/^Products \d+$/)
  const tab = page.locator('nav.tabs button.tab').filter({ hasText: created.name }).first()
  await expect(tab).toHaveClass(/active/)
  return { id: created.id, name: created.name }
}

async function openProductsCopy(page: Page, name: string) {
  const tab = page.locator('nav.tabs button.tab').filter({ hasText: name }).first()
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  const table = mainTable(page)
  await expect(table).toBeVisible({ timeout: 30_000 })
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  return table
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
  // The budget covers a Products template copy plus close/reopen and reload.
  test.setTimeout(300_000)
  await login(page)

  let copyId = ''
  try {
    const copy = await createProductsCopy(page)
    copyId = copy.id
    const table = await openProductsCopy(page, copy.name)
    const quick = table.getByTestId('quick-filter')
    const rows = table.getByTestId('object-row')
    const empty = table.getByTestId('object-table-empty')
    const view = productsTable(await getWorkspace(page, copy.id))
    if (!view) throw new Error('copy has no Products object table view')

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
    expect(await storedFilter(page, copy.id)).toBe('')

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
    expect(await storedFilter(page, copy.id)).toBe('')

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
    const afterReload = await openProductsCopy(page, copy.name)
    await expect(afterReload.getByTestId('quick-filter')).toHaveValue('')
    await expect(afterReload.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  } finally {
    if (copyId) {
      try {
        await page.locator('nav.tabs button.tab').filter({ hasText: /^Products$/ }).first().click()
        await page.request.delete(`/v1/workspaces/${copyId}`)
      } catch {
        // The page or context may already be gone; the run is isolated anyway.
      }
    }
  }
})
