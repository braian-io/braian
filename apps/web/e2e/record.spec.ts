import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('braian.theme', JSON.stringify('dark'))
  })
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openCheddar(page: Page) {
  const table = mainTable(page)
  const filter = table.getByTestId('quick-filter').first()
  if ((await filter.inputValue()) !== '') await filter.fill('')
  const row = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible()
  const objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(objectId).not.toBe('')
  await row.click()
  await page.locator('[data-view-type="object_detail"]').first().click()
  await expect(page.getByTestId('object-detail')).toBeVisible()
  return objectId
}

test('the detail pane shows a read-only meta line instead of the Record section', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const objectId = await openCheddar(page)

  await expect(page.getByTestId('record-section')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Record' })).toHaveCount(0)

  const meta = page.getByTestId('object-meta')
  await expect(meta).toBeVisible()
  await expect(meta.locator('input, textarea, [contenteditable="true"]')).toHaveCount(0)

  const text = (await meta.textContent()) ?? ''
  expect(text).toMatch(/^Created \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Updated \d{4}-\d{2}-\d{2} \d{2}:\d{2} by .+$/)

  const loaded = await page.request.get(`/v1/objects/${objectId}`)
  expect(loaded.ok()).toBeTruthy()
  const body = (await loaded.json()) as { updated_by?: { name?: string } }
  const who = body.updated_by?.name ?? ''
  expect(who).not.toBe('')
  await expect(meta).toContainText(`by ${who}`)
})
