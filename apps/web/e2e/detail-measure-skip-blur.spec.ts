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
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  const objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(objectId).not.toBe('')
  return { objectId, detail, row }
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

async function discardDetailDrafts(detail: ReturnType<Page['getByTestId']>) {
  const valueInput = detail.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
  await valueInput.focus()
  await detail.press('Escape')
}

function savedCount(line: string | null) {
  return ((line ?? '').match(new RegExp(copy.saved, 'g')) ?? []).length
}

test.describe('detail measure skip-blur', () => {
  test('Escape then type and Tab stages a draft', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      const { objectId: id, detail } = await openCheddarDetail(page)
      objectId = id
      energyBefore = await readEnergy(page, objectId)

      const valueInput = detail.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
      const committed = await valueInput.inputValue()
      await replaceMeasureInput(valueInput, '9,9')
      await detail.press('Escape')
      await expect(valueInput).toHaveValue(committed)
      await replaceMeasureInput(valueInput, '2')
      await valueInput.blur()

      await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
      await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
      await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe('2')
    } finally {
      if (objectId) {
        const detail = page.getByTestId('object-detail')
        if (await detail.isVisible()) await discardDetailDrafts(detail)
        await restoreEnergy(page, objectId, energyBefore)
      }
    }
  })

  test('Save is not blocked by an untouched empty measure field', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    try {
      await login(page)
      const { objectId: id, detail } = await openCheddarDetail(page)
      objectId = id
      energyBefore = await readEnergy(page, objectId)

      const energy = detail.getByTestId('detail-measure-field-energy')
      const valueInput = energy.getByTestId('detail-measure-value')
      const committed = await valueInput.inputValue()
      const next =
        committed === '1'
          ? '1,1'
          : committed.replace(',', '.') === '1.5'
            ? '1,6'
            : '1,5'
      const activity = page.getByTestId('activity-log')
      const beforeSaved = savedCount(await activity.textContent())
      await valueInput.fill(next)
      await valueInput.press('Tab')
      await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
      await expect(detail.getByTestId('review-and-save')).toHaveCount(0)

      const stored = next.replace(',', '.')
      await expect.poll(async () => savedCount(await activity.textContent()), { timeout: 60_000 }).toBeGreaterThan(beforeSaved)
      await expect.poll(async () => (await readEnergy(page, objectId))?.value, { timeout: 60_000 }).toBe(stored)
    } finally {
      if (objectId) await restoreEnergy(page, objectId, energyBefore)
    }
  })
})