import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const LINK_TYPE_ID = '018f0000-0000-7000-8000-000000000210'
const PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
}

test('Products pane in the Articles workspace lists rows after link repair', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  const { workspaces } = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
  const articles = workspaces.find((item) => item.name === 'Articles')
  expect(articles?.id).toBeTruthy()

  const workspace = await page.request.get(`/v1/workspaces/${articles!.id}`)
  expect(workspace.ok()).toBeTruthy()
  const { views } = (await workspace.json()) as {
    views: Array<{ id: string; type: string; pane: string; position: number }>
  }
  const table = views.find((view) => view.type === 'object_table')
  expect(table?.id).toBeTruthy()

  // Simulate the legacy bug: the pane is bound to the link type, not the entity.
  const broken = await page.request.post('/v1/views', {
    data: {
      id: table!.id,
      workspace_id: articles!.id,
      type: 'object_table',
      title: 'Products',
      pane: table!.pane ?? 'center',
      position: table!.position ?? 0,
      state: {
        object_type: LINK_TYPE_ID,
        type_key: 'product_articles',
        columns: ['number', 'name', 'brand'],
        sort: 'number',
      },
    },
  })
  expect(broken.ok()).toBeTruthy()

  // Reload so the workspace migration heals the link-bound pane on load.
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await page.locator('nav.tabs').getByRole('button', { name: 'Articles' }).click()
  await expect(page.getByTestId('object-table')).toBeVisible({ timeout: 30_000 })

  // The repaired pane lists the link's source entity, not zero rows.
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

  const healed = await page.request.get(`/v1/workspaces/${articles!.id}`)
  const { views: healedViews } = (await healed.json()) as {
    views: Array<{ id: string; state: { object_type?: string } }>
  }
  expect(healedViews.find((view) => view.id === table!.id)?.state.object_type).toBe(PRODUCT_TYPE_ID)
})
