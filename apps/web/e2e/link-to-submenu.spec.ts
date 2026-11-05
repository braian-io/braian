import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

test('row menu nests Link to destinations in a submenu', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Articles/ }).click()
  const table = mainTable(page, 'Articles')
  const row = table.getByTestId('object-row').first()
  await expect(row).toBeVisible()
  await row.click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /^Link to Product/ })).toHaveCount(0)
  await expect(menu.getByRole('menuitem', { name: /^Link to Supplier/ })).toHaveCount(0)
  const linkTo = menu.getByRole('menuitem', { name: 'Link to', exact: true })
  await expect(linkTo).toBeVisible()
  await expect(linkTo).toHaveAttribute('aria-haspopup', 'menu')

  await linkTo.hover()
  const sub = page.getByTestId('context-submenu')
  await expect(sub).toBeVisible()
  await expect(sub.getByRole('menuitem').first()).toBeVisible()
  const destinations = await sub.getByRole('menuitem').allTextContents()
  expect(destinations.length).toBeGreaterThan(0)

  // Parent stays the only highlighted root row until ArrowRight.
  await expect(linkTo).toHaveAttribute('data-highlighted', '')
  await expect(sub.getByRole('menuitem').first()).not.toHaveAttribute('data-highlighted')

  await page.keyboard.press('ArrowRight')
  await expect(sub.getByRole('menuitem').first()).toHaveAttribute('data-highlighted', '')
  await expect(linkTo).not.toHaveAttribute('data-highlighted')

  await page.keyboard.press('ArrowLeft')
  await expect(sub).toHaveCount(0)
  await expect(linkTo).toHaveAttribute('data-highlighted', '')

  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
})
