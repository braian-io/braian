import { expect, test, type Page, type Route } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function clearProductsPrefs(page: Page) {
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
    views: Array<{ id: string; type: string }>
  }
  const table = views.find((view) => view.type === 'object_table')
  if (!table) throw new Error('missing Products object table')
  const cleared = await page.request.delete(
    `/v1/views/${table.id}/column-prefs?environment=default`,
  )
  if (!cleared.ok()) throw new Error(`column prefs delete: HTTP ${cleared.status()}`)
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
}

test.describe('object table default columns', () => {
  test('Brand is a default column for a user without saved prefs', async ({ page }) => {
    await login(page)
    await clearProductsPrefs(page)

    await openProducts(page)
    await expect(mainTable(page)).toBeVisible()
    await expect(mainTable(page).locator('.head [data-testid="col-number"]').first()).toBeVisible()
    await expect(mainTable(page).locator('.head [data-testid="col-name"]').first()).toBeVisible()
    await expect(mainTable(page).locator('.head [data-testid="col-brand"]').first()).toBeVisible()
  })

  test('waits for definitions before seeding default columns', async ({ page }) => {
    await login(page)
    await clearProductsPrefs(page)

    let releaseDefinitions!: () => void
    const definitionsGate = new Promise<void>((resolve) => {
      releaseDefinitions = resolve
    })
    await page.route('**/v1/definitions**', async (route: Route) => {
      await definitionsGate
      await route.continue()
    })

    const prefsResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'GET' &&
        res.ok(),
    )
    await openProducts(page)
    await prefsResponse

    // Definitions is still held, so no fallback columns may be latched.
    await expect(page.getByTestId('column-prefs-skeleton').first()).toBeVisible()
    await expect(mainTable(page)).toHaveCount(0)
    await expect(mainTable(page).locator('.head [data-testid="col-brand"]').first()).toHaveCount(0)

    releaseDefinitions()

    await expect(mainTable(page)).toBeVisible()
    await expect(mainTable(page).locator('.head [data-testid="col-brand"]').first()).toBeVisible()
  })
})
