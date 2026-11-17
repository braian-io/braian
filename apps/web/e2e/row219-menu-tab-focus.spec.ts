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

async function nextTabStopAfter(page: Page, trigger: Locator) {
  const handle = await trigger.elementHandle()
  if (!handle) throw new Error('missing tab trigger')
  return page.evaluateHandle((triggerEl) => {
    const stops = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => {
      if (el.getClientRects().length === 0) return false
      if (el.closest('[inert], [aria-hidden="true"]')) return false
      return true
    })
    const index = stops.indexOf(triggerEl!)
    return index >= 0 ? (stops[index + 1] ?? null) : null
  }, handle)
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
    const expected = await nextTabStopAfter(page, tab)
    expect(await expected.evaluate((el) => el !== null), 'workspace tab has a following tab stop').toBe(true)
    const box = await tab.boundingBox()
    if (!box) throw new Error('missing workspace tab box')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
    const menu = page.getByTestId('workspace-menu')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(menu).toHaveCount(0)
    await expect
      .poll(() => expected.evaluate((el) => el === document.activeElement), {
        message: 'Tab from workspace menu focuses the next tab stop after the tab',
      })
      .toBe(true)
  })
})