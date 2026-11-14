import { expect, test, type Locator, type Page, type Route } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { copy } from '../src/i18n'
import { mainTable } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row238-shots')
mkdirSync(shots, { recursive: true })

const OBJECT_PATCH = '**/v1/objects/*'
const FAILURE = 'row 238 forced save failure'

type ObjectBody = { version?: number; values?: Record<string, unknown> }

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
  await expect(mainTable(page)).toBeVisible()
}

async function cheddarRow(page: Page) {
  const table = mainTable(page)
  const row = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  const objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(objectId).not.toBe('')
  return { table, row: page.locator(`[id="object-row-${objectId}"]`), objectId }
}

async function openDetail(page: Page, row: Locator) {
  await row.click()
  await page.locator('[data-view-type="object_detail"]').first().click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  return detail
}

function detailName(page: Page, detail: Locator) {
  return detail
    .locator('.field')
    .filter({ has: page.locator('label', { hasText: /^Name$/ }) })
    .first()
    .locator('.control input')
    .first()
}

async function readObject(page: Page, objectId: string): Promise<ObjectBody> {
  const response = await page.request.get(`/v1/objects/${objectId}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as ObjectBody
}

async function savedName(page: Page, objectId: string): Promise<string> {
  const body = await readObject(page, objectId)
  const name = body.values?.name
  return name && typeof name === 'object' ? String((name as Record<string, unknown>).en ?? '') : ''
}

async function restoreName(page: Page, objectId: string, name: unknown) {
  if (!name || typeof name !== 'object') return
  const current = await readObject(page, objectId)
  await page.request.patch(`/v1/objects/${objectId}`, {
    headers: { 'If-Match': String(current.version ?? 0) },
    data: { values: { name } },
  })
}

function failPatchOnce() {
  let failed = false
  return async (route: Route) => {
    if (route.request().method() !== 'PATCH' || failed) {
      await route.continue()
      return
    }
    failed = true
    await route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'about:blank',
        title: 'Unprocessable Entity',
        status: 422,
        code: 'invalid_object',
        detail: FAILURE,
      }),
    })
  }
}

function savedCount(line: string | null) {
  return ((line ?? '').match(new RegExp(copy.saved, 'g')) ?? []).length
}

test('a failed Save in Detail shows an error and keeps Save available for retry', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)
  const { row, objectId } = await cheddarRow(page)
  const before = await readObject(page, objectId)
  const originalName = before.values?.name
  try {
    const detail = await openDetail(page, row)
    const editor = detailName(page, detail)
    const original = await editor.inputValue()
    const edited = `${original} row238 detail`
    await editor.fill(edited)
    await expect(detail.getByTestId('object-draft-bar')).toBeVisible()

    const save = detail.getByTestId('review-and-save')
    await page.route(OBJECT_PATCH, failPatchOnce())
    try {
      await save.click()
      const error = detail.getByTestId('detail-error')
      await expect(error).toBeVisible()
      await expect(error).toContainText(FAILURE)
      // The failure is a banner, not a field validation error: retry stays open.
      await expect(save).toHaveText(copy.reviewAndSave)
      await expect(save).toBeEnabled()
      await expect(detail.getByTestId('discard-draft')).toBeEnabled()
      await expect(detail.getByTestId('review-blocked')).toHaveCount(0)
      await page.screenshot({ path: `${shots}/detail-failed-retry-available.png`, fullPage: true })
    } finally {
      await page.unroute(OBJECT_PATCH).catch(() => undefined)
    }

    await save.click()
    await expect(detail.getByTestId('detail-error')).toHaveCount(0)
    await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
    await expect(detail.locator('.detail-title strong')).toHaveText(edited)
    await expect.poll(() => savedName(page, objectId), { timeout: 20_000 }).toBe(edited)
  } finally {
    await restoreName(page, objectId, originalName)
  }
})

test('a failed Save in the table reports the error and keeps Save available for retry', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)
  const { table, row, objectId } = await cheddarRow(page)
  const before = await readObject(page, objectId)
  const originalName = before.values?.name
  try {
    const nameCell = row.locator('[data-column="name"]').first()
    const original = ((await nameCell.textContent()) ?? '').trim()
    const edited = `${original} row238 table`
    await page.route(OBJECT_PATCH, failPatchOnce())
    try {
      await nameCell.dblclick()
      const editor = page.getByTestId('cell-editor-name')
      await expect(editor).toBeVisible()
      await editor.fill(edited)
      await editor.press('Enter')
      await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)

      const save = table.getByTestId('review-and-save')
      await save.click()
      await expect(page.locator('[data-sonner-toast]')).toContainText(FAILURE)
      await expect(nameCell).toContainText(original)
      await expect(nameCell.getByTestId('cell-diff')).toContainText(edited)
      // A server failure is a toast, not a validation block. Retry stays open.
      await expect(save).toHaveText(copy.reviewAndSave)
      await expect(save).toBeEnabled()
      await expect(table.getByTestId('review-blocked')).toHaveCount(0)
    } finally {
      await page.unroute(OBJECT_PATCH).catch(() => undefined)
    }

    await table.getByTestId('review-and-save').click()
    await expect(table.getByTestId('object-draft-bar')).toHaveCount(0)
    await expect.poll(() => savedName(page, objectId), { timeout: 20_000 }).toBe(edited)
  } finally {
    await restoreName(page, objectId, originalName)
  }
})

test('Detail shows Saving and disables both buttons while a save is in flight', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)
  const { row, objectId } = await cheddarRow(page)
  const before = await readObject(page, objectId)
  const originalName = before.values?.name
  let release: () => void = () => {}
  const gate = new Promise<void>((resolveGate) => { release = resolveGate })
  try {
    const detail = await openDetail(page, row)
    const editor = detailName(page, detail)
    const edited = `${await editor.inputValue()} row238 in flight`
    await editor.fill(edited)
    const save = detail.getByTestId('review-and-save')
    const discard = detail.getByTestId('discard-draft')
    await page.route(OBJECT_PATCH, async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue()
        return
      }
      await gate
      await route.continue()
    })

    const activity = page.getByTestId('activity-log')
    const beforeSaved = savedCount(await activity.textContent())
    try {
      await save.click()
      await expect(save).toHaveText(copy.saving)
      await expect(save).toBeDisabled()
      await expect(discard).toBeDisabled()
      await page.screenshot({ path: `${shots}/detail-saving-in-flight.png`, fullPage: true })

      // A second press cannot start another save and must never report Saved.
      await save.evaluate((node) => (node as HTMLButtonElement).click())
      await page.waitForTimeout(250)
      expect(savedCount(await activity.textContent())).toBe(beforeSaved)
    } finally {
      release()
    }

    await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
    await expect.poll(() => savedName(page, objectId), { timeout: 20_000 }).toBe(edited)
  } finally {
    release()
    await page.unroute(OBJECT_PATCH).catch(() => undefined)
    await restoreName(page, objectId, originalName)
  }
})

test('the table shows Saving and disables both buttons while a save is in flight', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)
  const { table, row, objectId } = await cheddarRow(page)
  const before = await readObject(page, objectId)
  const originalName = before.values?.name
  let release: () => void = () => {}
  const gate = new Promise<void>((resolveGate) => { release = resolveGate })
  try {
    const nameCell = row.locator('[data-column="name"]').first()
    const edited = `${((await nameCell.textContent()) ?? '').trim()} row238 table flight`
    await nameCell.dblclick()
    const editor = page.getByTestId('cell-editor-name')
    await expect(editor).toBeVisible()
    await editor.fill(edited)
    await editor.press('Enter')
    await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)

    const save = table.getByTestId('review-and-save')
    const discard = table.getByTestId('discard-draft')
    await page.route(OBJECT_PATCH, async (route) => {
      if (route.request().method() !== 'PATCH') {
        await route.continue()
        return
      }
      await gate
      await route.continue()
    })

    const activity = page.getByTestId('activity-log')
    const beforeSaved = savedCount(await activity.textContent())
    try {
      await save.click()
      await expect(save).toHaveText(copy.saving)
      await expect(save).toBeDisabled()
      await expect(discard).toBeDisabled()
      await page.screenshot({ path: `${shots}/table-saving-in-flight.png`, fullPage: true })

      await save.evaluate((node) => (node as HTMLButtonElement).click())
      await page.waitForTimeout(250)
      expect(savedCount(await activity.textContent())).toBe(beforeSaved)
    } finally {
      release()
    }

    await expect(table.getByTestId('object-draft-bar')).toHaveCount(0)
    await expect.poll(() => savedName(page, objectId), { timeout: 20_000 }).toBe(edited)
  } finally {
    release()
    await page.unroute(OBJECT_PATCH).catch(() => undefined)
    await restoreName(page, objectId, originalName)
  }
})
