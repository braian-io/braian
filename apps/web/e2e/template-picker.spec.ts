import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function deleteShareToken(page: Page, token: string) {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  const body = (await listed.json()) as {
    workspaces: Array<{ id: string; share_token?: string | null; name: string }>
  }
  const row = body.workspaces.find((item) => item.share_token === token)
  if (!row) return
  const deleted = await page.request.delete(`/v1/workspaces/${row.id}`)
  expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
}

async function listWorkspaces(page: Page) {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  return (await listed.json()) as {
    workspaces: Array<{ id: string; share_token?: string | null; name: string }>
  }
}

async function ensureReviewExists(page: Page) {
  const body = await listWorkspaces(page)
  if (body.workspaces.some((item) => item.share_token === 'braian-review')) return
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New from template')
  await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.locator('.crumb')).toContainText('New from template')
  await palette.getByTestId('palette-input').fill('Review')
  await expect(palette.getByRole('option', { name: /^Review/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('nav.tabs button.tab', { hasText: 'Review' })).toBeVisible({ timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

test('tab menu New from template opens the template submenu and creates a tab', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  // Remove Review so Enter creates a fresh tab via canonicalShareToken braian-review.
  await deleteShareToken(page, 'braian-review')
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('nav.tabs button.tab', { hasText: 'Review' })).toHaveCount(0)

  const tab = page.locator('nav.tabs button.tab').first()
  await tab.click({ button: 'right' })
  const menu = page.getByTestId('workspace-menu')
  await expect(menu).toBeVisible()
  await menu.getByTestId('workspace-new-from-template').click()

  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await expect(palette.locator('.crumb')).toContainText('New from template')
  // Submenu lists templates only — not the generic Ctrl+K root.
  await expect(palette.getByRole('option', { name: /^Review/ })).toBeVisible()
  await expect(palette.getByRole('option', { name: /^Data model/ })).toBeVisible()
  await expect(palette.getByRole('option', { name: /On selected object/i })).toHaveCount(0)
  await expect(palette.getByRole('option', { name: /^Recent/i })).toHaveCount(0)
  await expect(palette.getByRole('option', { name: /^Review/ })).toContainText(/Create ·/)

  await palette.getByTestId('palette-input').fill('Review')
  const review = palette.getByRole('option', { name: /^Review/ })
  await expect(review).toBeVisible()
  // Query filters the submenu; Enter runs the first (only) match.
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)
  await expect(page.locator('nav.tabs button.tab', { hasText: 'Review' })).toBeVisible({ timeout: 30_000 })
})

test('Ctrl+K New from template submenu matches the tab menu', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New from template')
  await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.locator('.crumb')).toContainText('New from template')
  await expect(palette.getByRole('option', { name: /^Products/ })).toBeVisible()
  await expect(palette.getByRole('option', { name: /On selected object/i })).toHaveCount(0)
  await page.keyboard.press('Escape')
  // From Ctrl+K path Esc pops to root; another Esc closes.
  await page.keyboard.press('Escape')
  await expect(palette).toHaveCount(0)
})

test('opens an existing Review tab without creating another', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await ensureReviewExists(page)

  const before = await listWorkspaces(page)
  const beforeCount = before.workspaces.length
  expect(before.workspaces.filter((item) => item.share_token === 'braian-review')).toHaveLength(1)

  // Focus another tab so Enter must re-focus Review.
  const products = page.locator('nav.tabs button.tab', { hasText: 'Products' }).first()
  await products.click()
  await expect(products).toHaveClass(/active/)

  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New from template')
  await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.locator('.crumb')).toContainText('New from template')
  await expect(palette.getByRole('option', { name: /^Review/ })).toContainText(/Open existing/)
  await palette.getByTestId('palette-input').fill('Review')
  await expect(palette.getByRole('option', { name: /^Review/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)

  const reviewTab = page.locator('nav.tabs button.tab', { hasText: 'Review' })
  await expect(reviewTab).toBeVisible()
  await expect(reviewTab).toHaveClass(/active/)

  const after = await listWorkspaces(page)
  expect(after.workspaces.length).toBe(beforeCount)
  expect(after.workspaces.filter((item) => item.share_token === 'braian-review')).toHaveLength(1)
})

const SAVED_TEMPLATE_PRODUCT_TYPE_ID = '018f0000-0000-7000-8000-000000000200'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('saved workspace template creates a new workspace', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  const stamp = Date.now().toString(36)
  const key = `saved_template_${stamp}`
  const name = `Saved template ${stamp}`
  const mainView = crypto.randomUUID()
  const detailView = crypto.randomUUID()
  const definition = {
    views: [
      {
        id: mainView,
        type: 'object_table',
        title: 'Products',
        state: {
          columns: ['number', 'name', 'type', 'status'],
          sort: 'number',
          object_type: SAVED_TEMPLATE_PRODUCT_TYPE_ID,
          type_key: 'product',
        },
      },
      { id: detailView, type: 'object_detail', title: 'Detail', state: { language: 'en' } },
    ],
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.65, 0.35],
      children: [
        { type: 'tabs', views: [mainView], active: 0 },
        { type: 'tabs', views: [detailView], active: 0 },
      ],
    },
  }

  const applied = await page.request.post('/v1/config/apply', {
    data: [{ apiVersion: 'braian.io/v1', kind: 'WorkspaceTemplate', key, name, definition }],
  })
  expect(applied.status()).toBe(202)
  const proposal = (await applied.json()) as { proposal_id?: string }
  expect(proposal.proposal_id).toBeTruthy()
  const accepted = await page.request.post(`/v1/proposals/${proposal.proposal_id}/accept`, { data: {} })
  expect(accepted.ok()).toBeTruthy()
  const acceptedBody = (await accepted.json()) as { failed?: unknown[] }
  expect(acceptedBody.failed ?? []).toHaveLength(0)

  const before = await listWorkspaces(page)
  const existing = before.workspaces.find((item) => item.share_token === 'braian-model') ?? before.workspaces[0]
  expect(existing).toBeTruthy()
  const existingBefore = (await (await page.request.get(`/v1/workspaces/${existing.id}`)).json()) as {
    name: string
    layout: unknown
  }

  let createdId: string | undefined
  try {
    await page.keyboard.press('Control+K')
    const palette = page.getByTestId('command-palette')
    await expect(palette).toBeVisible()
    await palette.getByTestId('palette-input').fill('New from template')
    await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(palette.locator('.crumb')).toContainText('New from template')

    await palette.getByTestId('palette-input').fill(name)
    const saved = palette.getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}`) })
    await expect(saved).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(page.locator('nav.tabs button.tab', { hasText: name })).toBeVisible({ timeout: 30_000 })

    const after = await listWorkspaces(page)
    expect(after.workspaces.length).toBe(before.workspaces.length + 1)
    const created = after.workspaces.find((item) => item.name === name && !before.workspaces.some((old) => old.id === item.id))
    expect(created).toBeTruthy()
    createdId = created?.id

    const existingAfter = (await (await page.request.get(`/v1/workspaces/${existing.id}`)).json()) as {
      name: string
      layout: unknown
    }
    expect(existingAfter.name).toBe(existingBefore.name)
    expect(existingAfter.layout).toEqual(existingBefore.layout)
  } finally {
    if (createdId) {
      const deleted = await page.request.delete(`/v1/workspaces/${createdId}`)
      expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
    }
  }
})
