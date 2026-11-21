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

async function openProducts(page: Page) {
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  const grid = table.locator('.grid').first()
  await grid.focus()
  return { table, rows, grid }
}

test('holding ArrowDown through the Products list does not reload the page', async ({ page }) => {
  test.setTimeout(180_000)
  const { table, grid } = await openProducts(page)

  await page.evaluate(() => {
    ;(window as unknown as { __noReload?: number }).__noReload = 1
  })
  const onLoad = () => {
    throw new Error('full page load during held ArrowDown navigation')
  }
  page.on('load', onLoad)

  try {
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('object-detail')).toBeVisible()

    await page.keyboard.down('ArrowDown')
    try {
      await page.waitForTimeout(2_000)
    } finally {
      await page.keyboard.up('ArrowDown')
    }

    let stable = 0
    let lastActive = ''
    for (let step = 0; step < 300; step += 1) {
      await page.keyboard.press('ArrowDown', { delay: 10 })
      const active = (await grid.getAttribute('aria-activedescendant')) ?? ''
      if (active === lastActive) stable += 1
      else stable = 0
      lastActive = active
      if (stable >= 8) break
    }

    await expect.poll(async () => page.evaluate(() => (window as unknown as { __noReload?: number }).__noReload)).toBe(1)
    await expect(page.getByTestId('workspace')).toBeVisible()
    await expect(page.getByTestId('object-detail')).toBeVisible()

    const selected = table.getByTestId('object-row').and(table.locator('[aria-selected="true"]'))
    await expect(selected).toHaveCount(1)
    await expect(grid).toHaveAttribute('aria-activedescendant', lastActive)
    await expect(selected).toHaveAttribute('id', lastActive)
    expect(lastActive.length).toBeGreaterThan(0)
  } finally {
    page.off('load', onLoad)
  }
})