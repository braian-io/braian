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

test('restore dialog names the object, shows a diff, and hides empty impact rows', async ({ page }) => {
  const stamp = Date.now().toString().slice(-6)
  const number = `RST-${stamp}`
  try {
    await login(page)
    const row = mainTable(page).getByTestId('object-row').first()
    await row.click()
    await page.locator('[data-view-type="object_detail"]').first().click()

    const nummer = page.locator('[data-testid=object-detail] .field', { hasText: 'Number' }).locator('input')
    const original = await nummer.inputValue()
    const next = `${original || number}-restored`
    await nummer.fill(next)
    await page.getByTestId('object-detail').getByTestId('review-and-save').click()
    await expect(page.getByTestId('activity-log')).toContainText('Saved')

    await page.getByRole('button', { name: 'History' }).click()
    const history = page.getByTestId('history')
    const changed = history.locator('article', { has: page.getByTestId('field-diff') }).first()
    await expect(changed).toBeVisible()
    await changed.click()
    await changed.getByTestId('rollback').click()

    const dialog = page.getByTestId('restore-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('strong')).toContainText('Restore')
    await expect(dialog.locator('strong')).toContainText('version')
    await expect(dialog.getByTestId('field-diff')).toBeVisible()
    await expect(dialog.getByTestId('field-diff')).toContainText('Number')
    await expect(dialog.getByTestId('field-diff').locator('.diff-old')).toContainText(next)
    await expect(dialog.getByTestId('field-diff').locator('.diff-new')).toContainText(original)

    await expect(dialog.getByTestId('impact-result')).toHaveCount(0)
    await expect(dialog).not.toContainText('No job reads these fields.')
    await expect(dialog).not.toContainText('Sample: —')
    await expect(dialog).not.toContainText('Affected')
    await expect(dialog.getByTestId('confirm-restore')).toBeFocused()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    const proposals = await page.request.get('/v1/proposals')
    expect(proposals.ok()).toBeTruthy()
    const open = ((await proposals.json()) as { proposals?: Array<{ id?: string; source?: string; status?: string }> }).proposals
      ?.find((item) => item.source === 'rollback' && item.status === 'open')
    if (open?.id) {
      const discarded = await page.request.post(`/v1/proposals/${open.id}/discard`, { data: {} })
      expect(discarded.ok()).toBeTruthy()
    }
  } finally {
    // Discard is attempted above when a rollback proposal stays open.
  }
})