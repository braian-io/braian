import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(page.getByTestId('object-table')).toBeVisible()
}

test.describe('view source all-of-type (Notion 103 PR 1)', () => {
  test('Ctrl+K Data source and view menu Select source change the type source', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    // Data source is only offered when the focused pane is an object table.
    // A fresh seed focuses another pane, and the only "Data source" hit is
    // then Ask AI. Earlier files on a shared database left Products focused.
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    // The workspace tab can show the table while focus stays on another pane.
    await page.getByTestId('object-table').click({ position: { x: 24, y: 24 } })

    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await page.getByTestId('palette-input').fill('Data source')
    const root = page
      .getByTestId('command-palette')
      .locator('.hit')
      .filter({ hasText: 'Data source' })
      .filter({ hasNotText: 'Ask AI' })
      .first()
    await expect(root).toBeVisible()
    await root.click()
    await expect(page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All ' }).first()).toBeVisible()

    const products = page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All Products' })
    if (await products.count()) {
      await products.first().click()
    } else {
      await page.getByTestId('command-palette').locator('.hit').filter({ hasText: /^All / }).first().click()
    }
    await expect(page.getByTestId('command-palette')).toHaveCount(0)

    const focused = page.locator('.pane.focused')
    await expect(focused.getByTestId('view-source-label')).toBeVisible({ timeout: 30_000 })
    const label = (await focused.getByTestId('view-source-label').innerText()).trim()
    expect(label.startsWith('All ')).toBe(true)

    await focused.hover()
    await focused.getByTestId('view-menu').click()
    await expect(page.getByTestId('context-menu')).toBeVisible()
    await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Select source' }).click()
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await expect(page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All ' }).first()).toBeVisible()

    const articles = page.getByTestId('command-palette').locator('.hit').filter({ hasText: 'All Articles' })
    if (await articles.count()) {
      await articles.first().click()
      await expect(page.locator('.pane.focused').getByTestId('view-source-label')).toHaveText('All Articles', {
        timeout: 30_000,
      })
    } else {
      await page.keyboard.press('Escape')
    }

    await page.reload()
    await expect(page.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.pane.focused').getByTestId('view-source-label')).toBeVisible({ timeout: 30_000 })
    const after = (await page.locator('.pane.focused').getByTestId('view-source-label').innerText()).trim()
    expect(after.startsWith('All ')).toBe(true)
  })
})
