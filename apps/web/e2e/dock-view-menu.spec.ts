import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
}

async function leaves(page: Page) {
  return page.getByTestId('dock').getAttribute('data-leaves')
}

test('dock view menu shows only essential items; split stays in Ctrl+K', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  const productsTab = page.locator('.pane-tab', { hasText: 'Products' }).first()
  await productsTab.click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  const labels = await menu.getByRole('menuitem').evaluateAll((nodes) =>
    nodes.map((node) => (node.querySelector('.menu-label')?.textContent ?? '').trim()),
  )
  expect(labels).toEqual(['Add view', 'Select source', 'Maximize', 'Close view'])

  const beforeSplit = await leaves(page)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('Split right')
  const split = palette.getByRole('option', { name: /^Split right/ }).first()
  await expect(split).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)
  await expect.poll(() => leaves(page)).not.toBe(beforeSplit)
})