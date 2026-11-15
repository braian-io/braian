import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

/** Unlocked throwaway workspace so table sort can persist on the view row. */
async function createProductsWorkspace(
  page: Page,
): Promise<{ id: string; name: string; viewId: string }> {
  const id = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  const suffix = id.slice(0, 8)
  const name = `Row218 sort ${suffix}`
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id,
      name,
      locked: false,
      share_token: `row218-sort-${suffix}`,
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

async function openWorkspaceTab(page: Page, workspaceName: string) {
  const tab = page.locator('nav.tabs button.tab').filter({ hasText: workspaceName }).first()
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  const table = mainTable(page)
  await expect(table).toBeVisible({ timeout: 30_000 })
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await expect(table.getByTestId('column-prefs-skeleton')).toHaveCount(0)
  return table
}

async function reloadWorkspace(page: Page, workspaceName: string) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  return openWorkspaceTab(page, workspaceName)
}

function nameHeader(table: ReturnType<typeof mainTable>) {
  return table.locator('.head [data-testid="col-name"]').first()
}

async function firstName(table: ReturnType<typeof mainTable>) {
  return table.getByTestId('object-row').first().locator('[data-column="name"]').innerText()
}

async function waitForViewSortSave(page: Page) {
  const response = await page.waitForResponse(
    (item) =>
      item.request().method() === 'POST'
      && item.url().includes('/v1/views')
      && !item.url().includes('column-prefs')
      && item.ok(),
    { timeout: 30_000 },
  )
  const body = response.request().postDataJSON() as { state?: { table?: { sort?: string } } }
  return body.state?.table?.sort ?? ''
}

async function setNameSort(table: ReturnType<typeof mainTable>, direction: 'ascending' | 'descending' | 'none') {
  const header = nameHeader(table)
  await expect(header).toBeVisible()
  const button = header.locator('button.column-header-btn')
  const target =
    direction === 'ascending' ? 'ascending' : direction === 'descending' ? 'descending' : 'none'
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await header.getAttribute('aria-sort')
    if (current === target) return
    await button.click()
  }
  await expect(header).toHaveAttribute('aria-sort', target)
}

async function clearPersistedSort(page: Page, table: ReturnType<typeof mainTable>) {
  await setNameSort(table, 'none')
  await waitForViewSortSave(page)
}

test.describe('row 218 — sort arrow survives reload', () => {
  test('ascending name sort keeps the header arrow after reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const workspace = await createProductsWorkspace(page)
  try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
      const table = await openWorkspaceTab(page, workspace.name)
      await setNameSort(table, 'ascending')
      await waitForViewSortSave(page)

      const before = await firstName(table)
      const reloaded = await reloadWorkspace(page, workspace.name)
      await expect(nameHeader(reloaded)).toHaveAttribute('aria-sort', 'ascending')
      await expect(await firstName(reloaded)).toBe(before)

      await clearPersistedSort(page, reloaded)
    } finally {
      try {
        await page.request.delete(`/v1/workspaces/${workspace.id}`)
      } catch {
        // ignore
      }
    }
  })

  test('descending name sort keeps the header arrow after reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const workspace = await createProductsWorkspace(page)
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
      const table = await openWorkspaceTab(page, workspace.name)
      await setNameSort(table, 'descending')
      await waitForViewSortSave(page)

      const before = await firstName(table)
      const reloaded = await reloadWorkspace(page, workspace.name)
      await expect(nameHeader(reloaded)).toHaveAttribute('aria-sort', 'descending')
      await expect(await firstName(reloaded)).toBe(before)

      await clearPersistedSort(page, reloaded)
    } finally {
      try {
        await page.request.delete(`/v1/workspaces/${workspace.id}`)
      } catch {
        // ignore
      }
    }
  })

  test('cleared sort shows no arrow after reload', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const workspace = await createProductsWorkspace(page)
    try {
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
      const table = await openWorkspaceTab(page, workspace.name)
      await setNameSort(table, 'ascending')
      await waitForViewSortSave(page)
      await clearPersistedSort(page, table)

      const reloaded = await reloadWorkspace(page, workspace.name)
      await expect(nameHeader(reloaded)).toHaveAttribute('aria-sort', 'none')
      const number = reloaded.locator('.head [data-testid="col-number"], .head [data-testid="col-key"]').first()
      await expect(number).toHaveAttribute('aria-sort', 'none')
    } finally {
      try {
        await page.request.delete(`/v1/workspaces/${workspace.id}`)
      } catch {
        // ignore
      }
    }
  })
})