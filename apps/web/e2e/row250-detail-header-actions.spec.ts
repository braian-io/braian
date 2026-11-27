import { expect, test, type Locator, type Page } from '@playwright/test'

type Box = { x: number; y: number; width: number; height: number }
import { demoCredentials } from './demo'
import { mainTable, setTheme, waitDetailReady } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProductDetail(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  await expect(table).toBeVisible()
  const row = table.getByTestId('object-row').filter({ hasText: 'Hazelnut' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.click()
  await page.locator('[data-view-type="object_detail"]').first().click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  await waitDetailReady(page, detail)
  return detail
}

function boxCenterY(box: Box) {
  return box.y + box.height / 2
}

async function expectEqualSize(a: Box, b: Box) {
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(boxCenterY(a) - boxCenterY(b))).toBeLessThanOrEqual(1)
}

async function expectTooltip(page: Page, control: Locator, label: string) {
  await control.hover()
  await expect(page.getByRole('tooltip')).toContainText(label)
  await page.mouse.move(2, 2)
}

async function assertHeaderActions(page: Page, detail: Locator) {
  const open = detail.getByTestId('open-draft-in-table')
  const remove = detail.getByTestId('delete-object-detail')
  await expect(open).toBeVisible()
  await expect(remove).toBeVisible()
  await expect(open).toHaveAttribute('aria-label', 'Open in the table')
  await expect(remove).toHaveAttribute('aria-label', 'Delete')

  const openBox = await open.boundingBox()
  const removeBox = await remove.boundingBox()
  expect(openBox, 'open in table box').toBeTruthy()
  expect(removeBox, 'delete box').toBeTruthy()
  await expectEqualSize(openBox!, removeBox!)

  await expectTooltip(page, open, 'Open in the table')
  await expectTooltip(page, remove, 'Delete')

  await open.click()
  await page.keyboard.press('Tab')
  await expect(remove).toBeFocused()
  await expect.poll(async () =>
    remove.evaluate((node) => (node as HTMLElement).matches(':focus-visible')),
  ).toBe(true)

  await page.keyboard.press('Shift+Tab')
  await expect(open).toBeFocused()
  await expect.poll(async () =>
    open.evaluate((node) => (node as HTMLElement).matches(':focus-visible')),
  ).toBe(true)

  await page.keyboard.press('Tab')
  await expect(remove).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByTestId('delete-object-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('cancel-delete-object').click()
  await expect(dialog).toBeHidden()
}

test.describe('row 250 detail header actions', () => {
  test('icon buttons align, expose tooltips and labels in both themes', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)
    const detail = await openProductDetail(page)
    await assertHeaderActions(page, detail)

    await setTheme(page, 'dark')
    await assertHeaderActions(page, detail)

    await setTheme(page, 'light')
    await assertHeaderActions(page, detail)
  })
})