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

async function detailTitle(page: Page) {
  const detail = page.getByTestId('object-detail')
  return (await detail.locator('.detail-title strong').innerText()).trim()
}

test('arrowing through rows keeps Detail visible without a loading screen', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('detail-empty')).toBeVisible()

  const grid = table.locator('.grid').first()
  await grid.focus()

  for (let step = 0; step < 6; step += 1) {
    const row = rows.nth(step)
    const name = (await row.locator('[data-column="name"]').innerText()).trim()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('object-detail')).toBeVisible()
    await expect(page.getByTestId('detail-loading')).toHaveCount(0)
    await expect(page.getByTestId('state-loading')).toHaveCount(0)
    await expect.poll(() => detailTitle(page)).toBe(name)
  }
})