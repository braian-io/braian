import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
}

async function highlightedRing(menu: Locator) {
  const item = menu.locator('[data-highlighted]').first()
  await expect(item).toBeVisible()
  return item.evaluate((element) => {
    const style = getComputedStyle(element)
    const shadow = style.boxShadow
    const outline = style.outlineStyle
    const outlineWidth = Number.parseFloat(style.outlineWidth)
    const hasRing =
      (outline !== 'none' && outlineWidth > 0)
      || (shadow !== 'none' && shadow.includes('2px'))
    return { outline, outlineWidth, boxShadow: shadow, hasRing }
  })
}

test.describe('row 219 menu Tab and focus ring', () => {
  test('Tab closes the account menu and advances past Account', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const userMenu = page.getByTestId('user-menu')
    await userMenu.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('user-menu-content')).toBeVisible()
    await expect(page.getByTestId('user-menu-theme')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('user-menu-content')).toHaveCount(0)
    const focused = await page.evaluate(() => {
      const el = document.activeElement
      if (!(el instanceof HTMLElement)) return null
      return el.dataset.testid ?? el.getAttribute('aria-label') ?? el.className
    })
    expect(focused, 'focus leaves the account menu on Tab').not.toBe('user-menu')
    expect(focused, 'focus does not stay on Account').not.toBe('Account')
  })

  test('context menu highlighted item shows a focus ring in dark and light theme', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const table = mainTable(page)
    const row = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
    await expect(row).toBeVisible({ timeout: 60_000 })
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme)
      await row.click({ button: 'right' })
      const menu = page.getByTestId('context-menu')
      await expect(menu).toBeVisible()
      await page.keyboard.press('ArrowDown')
      const ring = await highlightedRing(menu)
      expect(ring.hasRing, `context menu ring (${theme}): ${JSON.stringify(ring)}`).toBe(true)
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
    }
  })

  test('workspace tab menu closes on Tab and moves focus past the tab', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const tab = page.locator('nav.tabs .tab.active').first()
    await expect(tab).toBeVisible()
    const nextTab = page.locator('nav.tabs .tab-new').first()
    const box = await tab.boundingBox()
    if (!box) throw new Error('missing workspace tab box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    const menu = page.getByTestId('workspace-menu')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(menu).toHaveCount(0)
    const onNext = await page.evaluate(() => document.activeElement === document.querySelector('[data-testid="workspace-new-button"]'))
    expect(onNext, 'Tab from workspace menu reaches the next top-nav control').toBe(true)
    void nextTab
  })
})