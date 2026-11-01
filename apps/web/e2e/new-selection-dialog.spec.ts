import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

function overlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

test('New selection dialog opens with aligned fields and keyboard focus', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.getByRole('button', { name: 'Products' }).click()
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New selection')
  await expect(palette.locator('.hit').filter({ hasText: 'New selection' }).first()).toBeVisible()
  await page.keyboard.press('Enter')

  const dialog = page.getByTestId('new-selection')
  await expect(dialog).toBeVisible()
  const title = dialog.getByRole('heading', { name: 'New selection' })
  const close = dialog.getByRole('button', { name: 'Close' })
  const name = page.getByTestId('assortment-name')
  const type = page.getByTestId('selection-type')
  const typeLabel = dialog.locator('label.model-field', { has: type }).locator('span')
  await expect(name).toBeVisible()
  await expect(type).toBeVisible()
  await name.focus()

  const closeBox = await close.boundingBox()
  const nameBox = await name.boundingBox()
  const typeBox = await type.boundingBox()
  const typeLabelBox = await typeLabel.boundingBox()
  expect(closeBox && nameBox && typeBox && typeLabelBox).toBeTruthy()
  if (!closeBox || !nameBox || !typeBox || !typeLabelBox) return

  const titleTextRight = await title.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().right
  })
  expect(titleTextRight).toBeLessThan(closeBox.x - 4)

  expect(overlap(nameBox, typeLabelBox)).toBe(false)
  expect(overlap(nameBox, typeBox)).toBe(false)
  expect(nameBox.y + nameBox.height).toBeLessThan(typeLabelBox.y - 2)
  expect(typeLabelBox.y + typeLabelBox.height).toBeLessThanOrEqual(typeBox.y + 2)
  expect(Math.abs(typeLabelBox.x - typeBox.x)).toBeLessThan(24)

  await expect(name).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(type).toBeFocused()
})
