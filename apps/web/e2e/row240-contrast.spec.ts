import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
}

/**
 * Composite the text colour over every painted ancestor background and return
 * the WCAG 2.2 relative-luminance contrast ratio. Alpha fills (accent-dim) only
 * count through the element that actually paints them.
 */
async function contrastOf(target: Locator): Promise<number> {
  return target.evaluate((node) => {
    type Rgba = { r: number; g: number; b: number; a: number }
    const parse = (value: string): Rgba | null => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
    }
    const over = (foreground: Rgba, background: Rgba): Rgba => {
      const a = foreground.a + background.a * (1 - foreground.a)
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
      return {
        r: (foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / a,
        g: (foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / a,
        b: (foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / a,
        a,
      }
    }
    const channel = (value: number) => {
      const scaled = value / 255
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
    }
    const lum = (color: Rgba) => 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    const backgroundOf = (element: Element | null) => {
      const layers: Rgba[] = []
      let current: Element | null = element
      while (current) {
        const color = parse(getComputedStyle(current).backgroundColor)
        if (color && color.a > 0) layers.push(color)
        if (color && color.a >= 1) break
        current = current.parentElement
      }
      let background: Rgba = { r: 255, g: 255, b: 255, a: 1 }
      for (let index = layers.length - 1; index >= 0; index -= 1) {
        const layer = layers[index]
        if (layer) background = over(layer, background)
      }
      return background
    }
    const style = getComputedStyle(node)
    const foreground = parse(style.color) ?? { r: 0, g: 0, b: 0, a: 1 }
    const background = backgroundOf(node)
    const painted = over(foreground, background)
    const hi = Math.max(lum(painted), lum(background))
    const lo = Math.min(lum(painted), lum(background))
    return (hi + 0.05) / (lo + 0.05)
  })
}

async function expectReadable(target: Locator, label: string) {
  await expect
    .poll(() => contrastOf(target), { timeout: 10_000, message: `${label} must settle at or above 4.5:1` })
    .toBeGreaterThanOrEqual(4.5)
}

async function expectReadableOnHover(target: Locator, label: string) {
  await target.hover()
  await expectReadable(target, label)
}

async function attach(testInfo: TestInfo, target: Locator, name: string) {
  await target.scrollIntoViewIfNeeded()
  await testInfo.attach(name, { body: await target.screenshot(), contentType: 'image/png' })
}

test('row 240 keeps actions, selected chips and muted labels readable', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  await login(page)
  await openProducts(page)

  const table = mainTable(page)
  const row = table.getByTestId('object-row').filter({ hasText: 'Cheddar' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.click()
  await page.locator('[data-view-type="object_detail"]').first().click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()

  const chip = detail.locator('.choice-chip').first()
  await expect(chip).toBeVisible()
  await chip.click()
  await expect(chip).toHaveClass(/\bon\b/)

  const bar = detail.getByTestId('object-draft-bar')
  const save = detail.getByTestId('review-and-save')
  const discard = detail.getByTestId('discard-draft')
  const remove = detail.getByTestId('delete-object-detail')
  await expect(bar).toBeVisible()
  await expect(save).toBeEnabled()
  await expect(discard).toBeEnabled()

  await setTheme(page, 'dark')
  await page.mouse.move(2, 2)
  await expectReadable(save, 'dark Save at rest')
  await expectReadable(discard, 'dark Discard at rest')
  await expectReadable(remove, 'dark Delete at rest')
  await expectReadable(chip, 'dark selected choice chip')
  await attach(testInfo, bar, 'row240-dark-save-discard')
  await attach(testInfo, detail.locator('.detail-actions').first(), 'row240-dark-delete')
  await attach(testInfo, detail.locator('.choices').first(), 'row240-dark-selected-chip')

  await expectReadableOnHover(save, 'dark Save on hover')
  await expectReadableOnHover(discard, 'dark Discard on hover')
  await expectReadableOnHover(remove, 'dark Delete on hover')

  await page.mouse.move(2, 2)
  await setTheme(page, 'light')
  await expectReadable(chip, 'light selected choice chip')
  await expectReadable(save, 'light Save at rest')
  await expectReadable(discard, 'light Discard at rest')
  const label = detail.locator('.field > label').first()
  await expect(label).toBeVisible()
  await expectReadable(label, 'light field label')
  await attach(testInfo, detail.locator('.field-card').first(), 'row240-light-field-label')
  await attach(testInfo, chip, 'row240-light-selected-chip')

  const header = page.locator('.head .column-header-btn:visible').first()
  await expect(header).toBeVisible()
  await expectReadable(header, 'light table header')
  await attach(testInfo, page.locator('.head:visible').first(), 'row240-light-table-header')

  // Review Discard all shares the danger button. Measure it when an open
  // proposal makes the action live; a closed proposal keeps it disabled.
  const reviewTab = page.locator('nav.tabs').getByRole('button', { name: /^Review/ })
  if ((await reviewTab.count()) > 0) {
    await reviewTab.first().click()
    const discardAll = page.getByTestId('discard-all').first()
    if ((await discardAll.count()) > 0 && (await discardAll.isVisible()) && (await discardAll.isEnabled())) {
      await page.mouse.move(2, 2)
      await expectReadable(discardAll, 'light Review Discard all')
      await attach(testInfo, discardAll, 'row240-light-review-discard-all')
    }
  }
})
