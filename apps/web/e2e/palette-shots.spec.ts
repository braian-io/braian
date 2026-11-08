import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const shotDir = process.env.PALETTE_SHOTS_DIR ?? '/opt/cursor/artifacts/screenshots'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

async function shot(target: Locator, name: string) {
  mkdirSync(shotDir, { recursive: true })
  await target.screenshot({ path: join(shotDir, name) })
}

test('palette flows for the local screenshot pass', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)

  const root = await openPalette(page)
  await expect(root.getByRole('option', { name: /^Open view/ }).first()).toBeVisible()
  await shot(root, '01-root-list.png')

  await page.getByTestId('palette-input').fill('open v')
  await expect(root.locator('.hit.on')).toContainText('Open view')
  await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*Open/)
  await shot(root, '02-ranking-open-v.png')
  await shot(page.getByTestId('palette-foot'), '10-footer-hints.png')

  await page.keyboard.press('Tab')
  await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
  await expect(page.getByTestId('palette-input')).toHaveAttribute('placeholder', 'Search views…')
  await expect(page.getByTestId('palette-back-hint')).toBeVisible()
  await shot(root, '03-drill-tab.png')
  await shot(root, '05-breadcrumb.png')
  await shot(page.locator('.palette-query'), '13-sublist-placeholder.png')
  await page.keyboard.press('Backspace')
  await expect(page.getByTestId('palette-crumb')).toBeEmpty()
  await expect(root).toBeVisible()
  await shot(root, '06-backspace-back.png')
  await page.keyboard.press('Escape')
  await expect(root).toHaveCount(0)

  const entered = await openPalette(page)
  await page.getByTestId('palette-input').fill('Open view')
  await expect(entered.locator('.hit.on')).toContainText('Open view')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
  await expect(page.getByTestId('ai-badge')).toHaveCount(0)
  await shot(entered, '04-drill-enter.png')
  await page.keyboard.press('Escape')

  await openPalette(page)
  await page.getByTestId('palette-input').fill('how many products')
  await page.keyboard.press('Tab')
  await expect(page.getByTestId('ai-badge')).toHaveCount(0)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  const agent = page.getByTestId('agent-view')
  await expect(agent).toContainText('how many products')
  await expect(page.getByTestId('agent-answer')).toHaveCount(0)
  await shot(agent, '07-ctrl-j-ask-ai.png')
  await shot(page.getByTestId('agent-open-draft'), '12-ask-ai-footer.png')
  await expect(page.getByTestId('activity-log')).not.toContainText('Agent:')

  async function drill(query: string) {
    const palette = await openPalette(page)
    await page.getByTestId('palette-input').fill(query)
    await expect(palette.locator('.hit.on')).toContainText(query)
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText(query)
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  }
  await drill('Open view')
  await drill('Open product')
  const recentPalette = await openPalette(page)
  const recent = recentPalette.locator('.palette-group').filter({
    has: page.locator('.palette-heading', { hasText: 'Recent' }),
  })
  await expect(recent.getByRole('option').nth(0)).toContainText('Open product')
  await expect(recent.getByRole('option').nth(1)).toContainText('Open view')
  await shot(recentPalette, '08-recent-order.png')
  await page.keyboard.press('Escape')

  const row = page.getByTestId('object-row').first()
  await row.click()
  await expect(page.getByTestId('object-detail')).toBeVisible({ timeout: 30_000 })
  const onProduct = await openPalette(page)
  await expect(onProduct.locator('.palette-heading', { hasText: /^On this/ })).toHaveCount(0)
  await expect(onProduct.locator('.palette-heading', { hasText: 'On selected object' })).toHaveCount(0)
  await expect(onProduct.getByRole('option', { name: 'Open to the right' })).toHaveCount(0)
  await shot(onProduct, '09-product-no-context.png')
  await page.keyboard.press('Escape')

  const empty = await openPalette(page)
  await page.getByTestId('palette-input').fill('zzzzqqqqnomatch')
  await expect(page.getByTestId('palette-empty')).toHaveText('No results for "zzzzqqqqnomatch"')
  await expect(empty.getByRole('option', { name: /Ask AI/ })).toBeVisible()
  await shot(empty, '11-no-results.png')
})
