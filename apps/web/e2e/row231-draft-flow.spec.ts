// Row 231. Open in the table follows the object's type and keeps Detail.
// Opening the agent does not reorder existing tabs. Reload restores Detail
// and History from the address. A proposal shows one Discard/Save bar, in Detail
// while Detail is open on that object.
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { agentSessionView, mainTable, resetProductsLayout } from './ui'

const PRODUCT_TYPE = 'product'
const stamp = Date.now().toString().slice(-8)

type ViewRow = {
  id: string
  type: string
  title: string
  pane?: string
  position?: number
  state?: Record<string, unknown>
}

type PaneTab = { type: string; label: string }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function createProduct(page: Page, key: string, name: string) {
  const response = await page.request.post('/v1/objects', {
    data: {
      type: PRODUCT_TYPE,
      groups: { food: 'bread' },
      values: { number: key, name: { en: name }, status: 'draft' },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as { id: string }
}

async function deleteProduct(page: Page, id: string) {
  const latest = await page.request.get(`/v1/objects/${id}`)
  if (!latest.ok()) return
  const body = (await latest.json()) as { version?: number }
  await page.request.delete(`/v1/objects/${id}`, {
    headers: { 'If-Match': String(body.version ?? 0) },
  })
}

async function showProduct(page: Page, id: string, key: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  await expect.poll(async () => {
    await table.getByTestId('quick-filter').first().fill(key)
    return page.locator(`#object-row-${id}`).count()
  }, { timeout: 20_000 }).toBe(1)
  await page.locator(`#object-row-${id}`).click()
  await expect(page.getByTestId('object-detail')).toContainText(key)
}

async function productsWorkspace(page: Page) {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok(), await listed.text()).toBeTruthy()
  const body = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
  const workspace = body.workspaces.find((item) => item.name === 'Products')
  expect(workspace?.id).toBeTruthy()
  const detail = await page.request.get(`/v1/workspaces/${workspace!.id}`)
  expect(detail.ok(), await detail.text()).toBeTruthy()
  const views = ((await detail.json()) as { views?: ViewRow[] }).views ?? []
  return { id: workspace!.id, views }
}

async function saveView(page: Page, workspaceId: string, view: ViewRow) {
  const response = await page.request.post('/v1/views', {
    data: {
      id: view.id,
      workspace_id: workspaceId,
      type: view.type,
      title: view.title,
      pane: view.pane ?? 'center',
      position: view.position ?? 0,
      state: view.state ?? {},
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
}

function isArticleTable(view: ViewRow) {
  return view.type === 'object_table' && (view.state?.type_key === 'article' || view.title === 'Articles')
}

async function paneTabs(page: Page): Promise<PaneTab[][]> {
  return page.locator('section.pane').evaluateAll((panes) =>
    panes.map((pane) =>
      [...pane.querySelectorAll('.pane-tab')].map((tab) => ({
        type: tab.getAttribute('data-view-type') ?? '',
        label: (tab.textContent ?? '').replace(/\s+/g, ' ').trim(),
      })),
    ),
  )
}

async function workspaceTabs(page: Page) {
  return page.locator('nav.tabs button.tab:not(.tab-new)').evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )
}

test('open in the table keeps the product, the tab order, and one Save bar', async ({ page }) => {
  test.setTimeout(180_000)
  const key = `ROW231-${stamp}`
  const name = `Row231 ${stamp}`
  let id = ''
  let workspaceId = ''
  let articles: ViewRow | undefined
  try {
    await login(page)
    await resetProductsLayout(page)
    const created = await createProduct(page, key, name)
    id = created.id
    const workspace = await productsWorkspace(page)
    workspaceId = workspace.id
    articles = workspace.views.find(isArticleTable)
    expect(articles, 'products workspace has an Articles table').toBeTruthy()
    // The old handler opened the first object table. Put Articles first in that list.
    await saveView(page, workspaceId, { ...articles!, pane: 'a', position: -1 })
    await page.reload()
    await expect(page.locator('nav.tabs')).toBeVisible()
    await showProduct(page, id, key)
    await expect.poll(() => new URL(page.url()).searchParams.get('object') ?? '').toContain(key)

    const tabsBefore = await paneTabs(page)
    const navBefore = await workspaceTabs(page)
    const prompt = `byt namn på den här produkten till ${name} draft`
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await page.getByTestId('palette-input').fill(prompt)
    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    const agent = agentSessionView(page, prompt)
    await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await expect(agent.getByTestId('agent-result-link').first()).toBeVisible({ timeout: 15_000 })

    const tabsAfter = await paneTabs(page)
    const navAfter = await workspaceTabs(page)
    expect(navAfter).toEqual(navBefore)
    const productsBefore = tabsBefore.find((tabs) => tabs.some((tab) => tab.label.startsWith('Products')))
    const productsAfter = tabsAfter.find((tabs) => tabs.some((tab) => tab.label.startsWith('Products')))
    expect(productsBefore?.length).toBeGreaterThan(0)
    expect(productsAfter).toEqual(productsBefore)
    expect(tabsAfter.some((tabs) => tabs.some((tab) => tab.type === 'agent'))).toBe(true)
    for (const prior of tabsBefore) {
      const match = tabsAfter.find((tabs) => {
        const kept = tabs.filter((tab) => tab.type !== 'agent')
        return prior.every((tab, index) => kept[index]?.type === tab.type && kept[index]?.label === tab.label)
      })
      expect(match, `tabs reordered: ${JSON.stringify(prior)}`).toBeTruthy()
    }

    await agent.getByRole('button', { name: /Open in the table/ }).click()
    const focused = page.locator('section.pane.focused .pane-tab.active')
    await expect(focused).toHaveAttribute('data-view-type', 'object_table')
    await expect(focused).toContainText('Products')
    await expect(focused).not.toContainText('Articles')
    const detail = page.getByTestId('object-detail')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText(key)
    await expect(detail.getByTestId('pending-field')).toBeVisible({ timeout: 30_000 })
    await expect(detail.getByTestId('object-draft-bar')).toHaveCount(1)
    await expect(mainTable(page).getByTestId('object-draft-bar')).toHaveCount(0)
    await expect(page.getByTestId('object-draft-bar')).toHaveCount(1)
    await expect(page.getByTestId('review-and-save')).toHaveCount(1)
    await detail.getByTestId('open-draft-in-table').click()
    await expect(focused).toContainText('Products')
    await expect(detail).toContainText(key)
    await expect(page.getByTestId('object-draft-bar')).toHaveCount(1)
    await expect(mainTable(page).getByTestId('object-draft-bar')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('object-detail')).toContainText(name, { timeout: 30_000 })
    await expect(page.getByTestId('object-detail')).toContainText(key)
    await page.locator('.pane-tab[data-view-type="history"]').first().click()
    const history = page.getByTestId('history')
    await expect(history).toBeVisible()
    await expect(history).toContainText(/\d+ change/)
    await expect(history).not.toContainText('No changes yet')
  } finally {
    if (workspaceId && articles) await saveView(page, workspaceId, articles).catch(() => undefined)
    if (id) await deleteProduct(page, id)
  }
})
