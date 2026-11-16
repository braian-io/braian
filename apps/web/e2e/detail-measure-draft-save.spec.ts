import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { copy } from '../src/i18n'

type MeasureValue = { value?: unknown; unit?: unknown }

const apiTimeout = 15_000

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openCheddarDetail(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const row = page.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.click()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  const objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(objectId).not.toBe('')
  return { objectId, row }
}

async function readEnergy(page: Page, objectId: string): Promise<MeasureValue | undefined> {
  const response = await page.request.get(`/v1/objects/${objectId}`, { timeout: apiTimeout })
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { values?: { energy?: MeasureValue } }
  return body.values?.energy
}

async function restoreEnergy(page: Page, objectId: string, snapshot: MeasureValue | undefined) {
  if (!snapshot) return
  const current = await page.request.get(`/v1/objects/${objectId}`, { timeout: apiTimeout })
  if (!current.ok()) return
  const version = (await current.json()) as { version?: number }
  await page.request.patch(`/v1/objects/${objectId}`, {
    headers: { 'If-Match': String(version.version ?? 0) },
    timeout: apiTimeout,
    data: { values: { energy: snapshot } },
  })
}

async function replaceMeasureInput(input: ReturnType<Page['locator']>, text: string) {
  await expect(input).toBeVisible()
  await input.focus()
  await input.evaluate((element) => {
    const field = element as HTMLInputElement
    field.setSelectionRange(0, field.value.length)
  })
  await input.pressSequentially(text, { delay: 0 })
  await expect(input).toHaveValue(text)
}

function savedCount(line: string | null) {
  return ((line ?? '').match(new RegExp(copy.saved, 'g')) ?? []).length
}

test.describe('detail measure draft save', () => {
  test('Ctrl+S commits the measure draft and saves', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      const detailCtx = await openCheddarDetail(page)
      objectId = detailCtx.objectId
      energyBefore = await readEnergy(page, objectId)

      const valueInput = page.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
      await replaceMeasureInput(valueInput, '1,5')
      await valueInput.press('Control+s')

      await expect(page.getByTestId('object-draft-bar')).toHaveCount(0, { timeout: 30_000 })
      await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe('1.5')
    } finally {
      if (objectId) await restoreEnergy(page, objectId, energyBefore)
    }
  })

  test('Ctrl+S with invalid measure text blocks save and marks aria-invalid', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    const patches: string[] = []
    try {
      await page.route('**/v1/objects/*', async (route) => {
        if (route.request().method() === 'PATCH') patches.push(route.request().postData() ?? '')
        await route.continue()
      })
      await login(page)
      const detailCtx = await openCheddarDetail(page)
      objectId = detailCtx.objectId
      energyBefore = await readEnergy(page, objectId)

      const valueInput = page.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
      const activity = page.getByTestId('activity-log')
      const beforeSaved = savedCount(await activity.textContent())
      await replaceMeasureInput(valueInput, 'abc')
      await valueInput.press('Control+s')

      await expect(valueInput).toHaveAttribute('aria-invalid', 'true')
      expect(patches).toHaveLength(0)
      expect(savedCount(await activity.textContent())).toBe(beforeSaved)
      expect((await readEnergy(page, objectId))?.value).toBe(energyBefore?.value)
    } finally {
      await page.unroute('**/v1/objects/*').catch(() => undefined)
      if (objectId) await restoreEnergy(page, objectId, energyBefore)
    }
  })

  test('Escape resets measure text and blur does not stage', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      const detailCtx = await openCheddarDetail(page)
      objectId = detailCtx.objectId
      energyBefore = await readEnergy(page, objectId)
      const beforeValue = energyBefore?.value

      const detail = page.getByTestId('object-detail')
      const valueInput = page.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
      const committed = await valueInput.inputValue()
      await replaceMeasureInput(valueInput, '9,9')
      await detail.press('Escape')
      await expect(valueInput).toHaveValue(committed)
      await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
      await valueInput.blur()
      expect((await readEnergy(page, objectId))?.value).toBe(beforeValue)
    } finally {
      if (objectId) await restoreEnergy(page, objectId, energyBefore)
    }
  })
})