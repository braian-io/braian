import { expect, test, type Browser, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

type WorkspaceView = {
  id: string
  type: string
  title: string
  pane?: string
  position?: number
  state: Record<string, unknown>
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function createProductsWorkspace(page: Page): Promise<{ id: string; name: string; viewId: string }> {
  const id = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  const suffix = id.slice(0, 8)
  const name = `Row229 search ${suffix}`
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id,
      name,
      locked: false,
      share_token: `row229-search-${suffix}`,
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

async function reloadDock(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function openWorkspaceTab(page: Page, name: string) {
  const tab = page.locator('nav.tabs button.tab').filter({ hasText: name }).first()
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  const table = mainTable(page)
  await expect(table).toBeVisible({ timeout: 30_000 })
  await expect(table.getByTestId('quick-filter')).toHaveValue('')
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  return table
}

async function getView(page: Page, workspaceId: string, viewId: string): Promise<WorkspaceView> {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(response.ok()).toBeTruthy()
  const workspace = (await response.json()) as { views: WorkspaceView[] }
  const view = workspace.views.find((item) => item.id === viewId)
  if (!view) throw new Error(`workspace ${workspaceId} has no view ${viewId}`)
  return view
}

async function storedTableFilter(page: Page, workspaceId: string, viewId: string): Promise<string> {
  const view = await getView(page, workspaceId, viewId)
  const table = view.state.table as { filter?: string } | undefined
  return table?.filter ?? ''
}

/** Simulate an old client that only wrote toolbar search into state.table.filter. */
async function poisonViewTableFilter(page: Page, workspaceId: string, viewId: string, filter: string) {
  const view = await getView(page, workspaceId, viewId)
  const state = view.state
  const table = { ...(state.table as Record<string, unknown> | undefined), filter }
  const poisoned = await page.request.post('/v1/views', {
    data: {
      id: viewId,
      workspace_id: workspaceId,
      type: view.type,
      title: view.title,
      pane: view.pane ?? 'main',
      position: view.position ?? 0,
      state: { ...state, table },
    },
  })
  expect(poisoned.ok(), `poison view ${poisoned.status()}`).toBeTruthy()
}

test('table search stays local per browser session', async ({ browser }) => {
  test.setTimeout(300_000)
  let workspaceId = ''
  let viewId = ''
  let workspaceName = ''
  const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = []

  try {
    const seed = await browser.newContext()
    contexts.push(seed)
    const seedPage = await seed.newPage()
    await login(seedPage)
    const workspace = await createProductsWorkspace(seedPage)
    workspaceId = workspace.id
    viewId = workspace.viewId
    workspaceName = workspace.name
    await seed.close()

    const contextA = await browser.newContext()
    const contextB = await browser.newContext()
    contexts.push(contextA, contextB)
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    await login(pageA)
    await login(pageB)

    await reloadDock(pageA)
    await reloadDock(pageB)
    await openWorkspaceTab(pageA, workspaceName)
    await openWorkspaceTab(pageB, workspaceName)

    const termA = `ROW229-A-${Date.now()}`
    const termB = `ROW229-B-${Date.now() + 1}`
    const quickA = mainTable(pageA).getByTestId('quick-filter')
    const quickB = mainTable(pageB).getByTestId('quick-filter')

    await quickA.fill(termA)
    await expect(quickA).toHaveValue(termA)
    await expect(quickB).toHaveValue('')

    await quickB.fill(termB)
    await expect(quickB).toHaveValue(termB)
    await expect(quickA).toHaveValue(termA)

    const poison = `ROW229-POISON-${Date.now()}`
    await poisonViewTableFilter(pageB, workspaceId, viewId, poison)
    expect(await storedTableFilter(pageB, workspaceId, viewId)).toBe('')

    await reloadDock(pageA)
    await openWorkspaceTab(pageA, workspaceName)

    await quickA.fill(termA)
    await expect(quickA).toHaveValue(termA)
    await expect(mainTable(pageB).getByTestId('quick-filter')).toHaveValue(termB)
  } finally {
    for (const context of contexts) {
      try {
        await context.close()
      } catch {
        // Context may already be closed.
      }
    }
    if (workspaceId) {
      try {
        const dispose = await browser.newContext()
        const page = await dispose.newPage()
        await login(page)
        await page.request.delete(`/v1/workspaces/${workspaceId}`)
        await dispose.close()
      } catch {
        // Best-effort cleanup.
      }
    }
  }
})