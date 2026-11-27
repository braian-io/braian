import { mainTable } from './ui'
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
  const filter = mainTable(page).getByTestId('quick-filter').first()
  if ((await filter.inputValue()) !== '') await filter.fill('')
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible()
}

async function restoreNumber(page: Page, objectId: string, original: string) {
  if (!objectId || !original) return
  try {
    const current = await page.request.get(`/v1/objects/${objectId}`)
    if (!current.ok()) return
    const body = (await current.json()) as { version?: number }
    await page.request.patch(`/v1/objects/${objectId}`, {
      headers: { 'If-Match': String(body.version ?? 0) },
      data: { values: { number: original } },
    })
  } catch {
    // Best-effort cleanup.
  }
}

test('history restore applies immediately with inline diff and no dialog', async ({ page }) => {
  const stamp = Date.now().toString().slice(-6)
  let objectId = ''
  let original = ''
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    const row = mainTable(page).getByTestId('object-row').first()
    objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
    await row.click()
    await page.locator('[data-view-type="object_detail"]').first().click()

    const nummer = page.locator('[data-testid=object-detail] .field', { hasText: 'Number' }).locator('input')
    original = await nummer.inputValue()
    const next = `${original}-inline`
    await nummer.fill(next)
    await nummer.blur()
    await expect(page.getByTestId('object-detail').getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('activity-log')).toContainText('Saved')

    await page.getByRole('button', { name: 'History' }).click()
    const history = page.getByTestId('history')
    const changed = history.locator('article', { has: page.getByTestId('field-diff') }).first()
    await expect(changed).toBeVisible()

    const diff = changed.getByTestId('field-diff')
    await expect(diff).toContainText('Number')
    await expect(diff.locator('.diff-old')).toHaveText(original)
    await expect(diff.locator('.diff-new')).toHaveText(next)

    const restore = changed.getByTestId('rollback')
    await expect(restore).toBeVisible()
    await expect(restore).toHaveAttribute('aria-label', 'Restore this version')

    await expect(page.getByTestId('restore-dialog')).toHaveCount(0)
    await restore.click()
    await expect(page.getByTestId('restore-dialog')).toHaveCount(0)
    await expect(page.getByTestId('consequence')).toHaveCount(0)

    await page.locator('[data-view-type="object_detail"]').first().click()
    await expect(nummer).toHaveValue(original)

    await page.getByRole('button', { name: 'History' }).click()
    const newest = history.locator('article', { has: page.getByTestId('field-diff') }).first()
    await expect(newest.getByTestId('field-diff').locator('.diff-old')).toHaveText(next)
    await expect(newest.getByTestId('field-diff').locator('.diff-new')).toHaveText(original)
  } finally {
    if (loggedIn && objectId) await restoreNumber(page, objectId, original)
  }
})