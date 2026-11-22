import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

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

test.describe('detail measure unchanged format', () => {
  test('comma decimal and trailing zero do not stage a draft or change storage', async ({ page }) => {
    test.setTimeout(120_000)
    let objectId = ''
    let energyBefore: MeasureValue | undefined
    const pinned: MeasureValue = { value: '485.181644', unit: 'kJ' }
    try {
      await login(page)
      const { objectId: id, detail } = await openCheddarDetail(page)
      objectId = id
      energyBefore = await readEnergy(page, objectId)
      const current = await page.request.get(`/v1/objects/${objectId}`, { timeout: apiTimeout })
      const version = (await current.json()) as { version?: number }
      await page.request.patch(`/v1/objects/${objectId}`, {
        headers: { 'If-Match': String(version.version ?? 0) },
        timeout: apiTimeout,
        data: { values: { energy: pinned } },
      })
      await page.reload()
      await expect(page.getByTestId('workspace')).toBeVisible()
      const reopened = await openCheddarDetail(page)
      const valueInput = reopened.detail.getByTestId('detail-measure-field-energy').getByTestId('detail-measure-value')
      await expect(valueInput).toHaveValue('485.181644')

      for (const typed of ['485,181644', '485.1816440']) {
        await replaceMeasureInput(valueInput, typed)
        await valueInput.blur()
        await expect(reopened.detail.getByTestId('object-draft-bar')).toHaveCount(0)
        await expect(reopened.detail.getByTestId('detail-field-control-energy')).not.toHaveClass(/draft-user/)
        expect(await readEnergy(page, objectId)).toEqual(pinned)
      }
    } finally {
      try {
        if (objectId) await restoreEnergy(page, objectId, energyBefore)
      } catch (error) {
        console.error('energy cleanup failed:', error)
      }
    }
  })
})