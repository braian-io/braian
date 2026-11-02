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

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(page.getByTestId('object-table')).toBeVisible()
}

async function resetProductsColumnPrefs(page: Page) {
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
    views: Array<{ id: string; type: string; state?: { type_key?: string } }>
  }
  const table = views.find(
    (view) => view.type === 'object_table' && view.state?.type_key === 'product',
  )
  if (!table) throw new Error('missing Products object table')
  const cleared = await page.request.delete(
    `/v1/views/${table.id}/column-prefs?environment=default`,
  )
  if (!cleared.ok()) throw new Error(`column prefs: HTTP ${cleared.status()}`)
}

async function openFieldsPalette(page: Page) {
  await page.getByTestId('object-table').focus()
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await page.getByTestId('palette-input').fill('Select fields')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('fields-mode')).toBeVisible()
}

async function enterOn(page: Page, rowTestId: string) {
  await expect(page.getByTestId(rowTestId)).toBeVisible()
  for (let i = 0; i < 40; i += 1) {
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

async function toggleBrand(page: Page) {
  await openFieldsPalette(page)
  await enterOn(page, 'fields-row-brand')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('fields-mode')).toHaveCount(0)
}

test.describe('column prefs multitab', () => {
  test('Brand hide in tab 2 survives tab-1 hide flush and reload', async ({ browser }) => {
    const context = await browser.newContext()
    const page1 = await context.newPage()
    const page2 = await context.newPage()

    await login(page1)
    // The demo user and database are shared between specs. Start from no saved
    // prefs, then reload so the first Products paint cannot keep a stale GET.
    await resetProductsColumnPrefs(page1)
    await page1.reload()
    await expect(page1.getByTestId('workspace')).toBeVisible()
    await openProducts(page1)
    await expect(page1.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    await expect(page1.locator('.head [data-testid="col-brand"]')).toBeVisible()

    // Prime tab 1 like a real session that has saved prefs once: hide then show Brand
    // so latestPrefsDocument retains a settled Brand-visible snapshot.
    const primePut = page1.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await toggleBrand(page1)
    await expect(page1.locator('.head [data-testid="col-brand"]')).toHaveCount(0)
    await primePut
    const primePut2 = page1.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await toggleBrand(page1)
    await expect(page1.locator('.head [data-testid="col-brand"]')).toBeVisible()
    await primePut2

    await page2.goto('/')
    await expect(page2.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
    await openProducts(page2)
    await expect(page2.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    await expect(page2.locator('.head [data-testid="col-brand"]')).toBeVisible()

    // Tab 2: Ctrl+K → Fields › → uncheck Brand.
    const put2 = page2.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await toggleBrand(page2)
    await expect(page2.locator('.head [data-testid="col-brand"]')).toHaveCount(0)
    await put2

    // Real tab switch: tab 1 goes hidden. Without a dirty gate it would keepalive-PUT
    // its settled Brand-visible snapshot and overwrite tab 2.
    await page1.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page1.waitForTimeout(500)

    // Focus tab 1 again — sync from server when clean.
    await page1.bringToFront()
    await page1.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      })
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    await page1.locator('.head [data-testid="col-number"]').click()

    await expect(page1.locator('.head [data-testid="col-brand"]')).toHaveCount(0, {
      timeout: 30_000,
    })

    await page1.reload()
    await expect(page1.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
    await expect(page1.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    await expect(page1.locator('.head [data-testid="col-brand"]')).toHaveCount(0)

    await context.close()
  })
})
