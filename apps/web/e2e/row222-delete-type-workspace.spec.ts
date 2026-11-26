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

async function openObjectTypes(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const tab = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  await expect(page.getByTestId('object-types-table')).toBeVisible()
}

test('deleting a new object type removes its workspace tab immediately and after reload', async ({ page }) => {
  test.setTimeout(180_000)
  const suffix = Date.now().toString().slice(-6)
  const key = `row222_${suffix}`
  const plural = `Rows222 ${suffix}`
  const singular = `Row222 ${suffix}`
  const token = `braian-type-row222-${suffix}`

  try {
    await login(page)
    await openObjectTypes(page)
    const table = page.getByTestId('object-types-table')

    await table.getByTestId('table-add-row').click()
    const create = page.getByTestId('create-dialog')
    await expect(create).toBeVisible()
    await create.getByTestId('new-name').fill(singular)
    await create.getByTestId('new-plural').fill(plural)
    await create.getByTestId('new-key').fill(key)
    await create.getByTestId('create-object').click()
    await expect(create).toHaveCount(0)
    await expect(page.getByTestId('unsaved-changes')).toBeVisible()

    const saved = page.waitForResponse(
      (response) => response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST',
    )
    await page.getByTestId('review-save').click()
    expect((await saved).ok()).toBeTruthy()
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

    const workspaceTab = page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${plural}`) })
    await expect(workspaceTab).toBeVisible({ timeout: 60_000 })

    const typeRow = table.locator(`[data-row-id="${key}"]`)
    await expect(typeRow).toBeVisible()

    await typeRow.click({ button: 'right' })
    await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Delete…' }).click()
    const dialog = page.getByTestId('consequence')
    await expect(dialog).toBeVisible()
    await page.getByTestId('confirm-delete').click()
    await expect(dialog).toHaveCount(0)
    await expect(typeRow).toHaveCount(0)
    await expect(workspaceTab).toHaveCount(0)

    const listed = (await (await page.request.get('/v1/workspaces')).json()) as {
      workspaces?: Array<{ share_token?: string | null }>
    }
    expect(listed.workspaces?.some((row) => row.share_token === token)).toBe(false)

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    await expect(page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${plural}`) })).toHaveCount(0)
  } finally {
    await page.request.delete(`/v1/types/${key}`, { timeout: 30_000 }).catch(() => undefined)
    const listed = await page.request.get('/v1/workspaces', { timeout: 30_000 }).catch(() => null)
    if (listed?.ok()) {
      const body = (await listed.json()) as { workspaces?: Array<{ id?: string; share_token?: string | null }> }
      for (const row of body.workspaces ?? []) {
        if (row.share_token === token && row.id) {
          await page.request.delete(`/v1/workspaces/${row.id}`, { timeout: 30_000 }).catch(() => undefined)
        }
      }
    }
  }
})