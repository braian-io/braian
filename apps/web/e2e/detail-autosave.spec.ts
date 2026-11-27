import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type ObjectBody = { version?: number; values?: Record<string, unknown> }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openCheddar(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  const row = mainTable(page).getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  const objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(objectId).not.toBe('')
  await row.click()
  await page.locator('[data-view-type="object_detail"]').first().click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  return { detail, objectId }
}

function fieldInput(page: Page, detail: Locator, label: RegExp) {
  return detail.locator('.field').filter({ has: page.locator('label', { hasText: label }) }).first().locator('.control input').first()
}

async function readObject(page: Page, objectId: string): Promise<ObjectBody> {
  const response = await page.request.get(`/v1/objects/${objectId}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as ObjectBody
}

async function restoreValues(page: Page, objectId: string, values: Record<string, unknown>) {
  const current = await readObject(page, objectId)
  await page.request.patch(`/v1/objects/${objectId}`, {
    headers: { 'If-Match': String(current.version ?? 0) },
    data: { values },
  })
}

test('Detail commits a field on blur, reloads it, and has no Save bar', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const { detail, objectId } = await openCheddar(page)
  const before = await readObject(page, objectId)
  const originalName = before.values?.name
  try {
    const editor = fieldInput(page, detail, /^Name$/)
    const original = await editor.inputValue()
    const edited = `${original} autosave`
    await editor.fill(edited)
    await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
    await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
    await editor.blur()
    await expect(detail.locator('.detail-title strong')).toHaveText(edited)
    await expect(page.getByTestId('activity-log')).toContainText('Saved')
    await expect.poll(async () => {
      const body = await readObject(page, objectId)
      const name = body.values?.name
      return name && typeof name === 'object' ? String((name as Record<string, unknown>).en ?? '') : ''
    }, { timeout: 20_000 }).toBe(edited)

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    const again = page.getByTestId('object-detail')
    await expect(again).toBeVisible()
    await expect(fieldInput(page, again, /^Name$/)).toHaveValue(edited)
    await expect(again.getByTestId('review-and-save')).toHaveCount(0)
    await expect(again.getByTestId('object-draft-bar')).toHaveCount(0)

    const saved = await readObject(page, objectId)
    const changes = await page.request.get(`/v1/objects/${objectId}/changes`)
    expect(changes.ok(), await changes.text()).toBeTruthy()
    const history = await changes.json()
    expect(JSON.stringify(history)).toContain(edited)
    expect(saved.version ?? 0).toBeGreaterThan(before.version ?? 0)
  } finally {
    if (originalName) await restoreValues(page, objectId, { name: originalName })
  }
})

test('Escape in Detail restores the saved field and does not write', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const { detail, objectId } = await openCheddar(page)
  const before = await readObject(page, objectId)
  const editor = fieldInput(page, detail, /^Name$/)
  const original = await editor.inputValue()
  await editor.fill(`${original} revert`)
  await editor.press('Escape')
  await expect(editor).toHaveValue(original)
  await editor.blur()
  await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
  const after = await readObject(page, objectId)
  const name = after.values?.name
  const saved = name && typeof name === 'object' ? String((name as Record<string, unknown>).en ?? '') : ''
  expect(saved).toBe(original)
  expect(after.version ?? 0).toBe(before.version ?? 0)
})

test('an invalid Detail value shows an error and is not saved', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const { detail, objectId } = await openCheddar(page)
  const before = await readObject(page, objectId)
  const energy = detail.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
  await expect(energy).toBeVisible()
  const original = await energy.inputValue()
  await energy.fill('abc')
  await energy.blur()
  const error = detail.getByTestId('detail-field-status').filter({ hasText: 'Enter a number' })
  await expect(error).toBeVisible()
  await expect(error).toHaveAttribute('data-state', 'error')
  await expect(energy).toHaveAttribute('aria-invalid', 'true')
  await expect(energy).toHaveValue('abc')
  await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
  const after = await readObject(page, objectId)
  expect(after.version ?? 0).toBe(before.version ?? 0)
  const stored = (after.values?.energy as { value?: unknown } | undefined)?.value
  const previous = (before.values?.energy as { value?: unknown } | undefined)?.value
  expect(stored ?? null).toEqual(previous ?? null)
  expect(String(stored ?? '')).not.toBe('abc')
  await energy.press('Escape')
  await expect(energy).toHaveValue(original)
})
