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
  await expect(page.getByTestId('record-section')).toBeVisible()
  return objectId
}

function createdLabel(page: Page) {
  return page.getByTestId('attr-key-created_at').locator('xpath=ancestor::div[contains(@class,"standard-grid-row")][1]').locator('[data-column="label"]')
}

async function renameCreated(page: Page, label: string) {
  await page.getByRole('button', { name: 'Data model' }).click()
  const cell = createdLabel(page)
  await expect(cell).toBeVisible()
  await cell.dblclick()
  const input = page.getByTestId('attr-label-created_at')
  await expect(input).toBeVisible()
  await input.fill(label)
  await input.press('Enter')
  const table = page.getByTestId('attribute-table')
  await expect(table.getByTestId('review-and-save')).toBeVisible()
  await table.getByTestId('review-and-save').click()
  const review = page.getByTestId('review-dialog')
  await expect(review).toBeVisible()
  await review.getByTestId('confirm-review').click()
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
}

test('the detail pane shows a read-only Record section', async ({ page }) => {
  test.setTimeout(120_000)
  let renamed = false
  try {
    await login(page)
    const objectId = await openCheddar(page)

    await page.locator('[data-view-type="object_detail"]').first().focus()
    let entered = false
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press('Tab')
      entered = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="record-section"]')))
      if (entered) break
    }
    expect(entered).toBe(true)
    const record = page.getByTestId('record-section')
    await expect(record.getByRole('heading', { name: 'Record' })).toBeVisible()
    const number = record.getByTestId('record-number')
    await expect(number).toBeFocused()
    await expect(record.getByText('Number', { exact: true })).toBeVisible()
    await expect(record.getByText('Name', { exact: true })).toBeVisible()
    await expect(record.getByText('Created', { exact: true })).toBeVisible()
    await expect(record.getByText('Updated', { exact: true })).toBeVisible()
    await expect(record.getByText('Updated by', { exact: true })).toBeVisible()
    await expect(number).toHaveValue('PROD-CHEDDAR')
    await expect(record.getByTestId('record-name')).toHaveValue('Mature cheddar')

    const created = record.getByTestId('record-created_at')
    const updated = record.getByTestId('record-updated_at')
    const createdIso = await created.getAttribute('title')
    const updatedIso = await updated.getAttribute('title')
    expect(createdIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(updatedIso).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    const stamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/
    await expect(created).toHaveValue(stamp)
    await expect(updated).toHaveValue(stamp)
    const createdShown = await created.inputValue()

    const loaded = await page.request.get(`/v1/objects/${objectId}`)
    expect(loaded.ok()).toBeTruthy()
    const body = (await loaded.json()) as { updated_by?: { name?: string } }
    const who = body.updated_by?.name ?? ''
    expect(who).not.toBe('')
    await expect(record.getByTestId('record-updated_by')).toHaveValue(who)
    await expect(page.locator('.detail-head')).not.toContainText('Updated by')

    await number.press('Control+a')
    const selected = await number.evaluate((node) => {
      const input = node as HTMLInputElement
      return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0)
    })
    expect(selected).toBe('PROD-CHEDDAR')
    await number.press('x')
    await expect(number).toHaveValue('PROD-CHEDDAR')

    const next = `Recorded ${Date.now().toString().slice(-6)}`
    await renameCreated(page, next)
    renamed = true
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    await page.locator('[data-view-type="object_detail"]').first().click()
    await expect(page.getByTestId('record-section').getByText(next, { exact: true })).toBeVisible()
    await expect(page.getByTestId('record-created_at')).toHaveValue(createdShown)
  } finally {
    if (!renamed) return
    await renameCreated(page, 'Created').catch(() => undefined)
  }
})
