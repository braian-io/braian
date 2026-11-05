import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

const shotsRoot = '/cursor/stores/bc-c19c1a7c-924e-5d74-9a17-f9261da84058/screenshots'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function saveShot(page: Page, name: string) {
  mkdirSync(shotsRoot, { recursive: true })
  await page.screenshot({ path: join(shotsRoot, name), fullPage: false })
}

async function crumbColor(page: Page) {
  return page.locator('.crumb').first().evaluate((el) => getComputedStyle(el).color)
}

async function accentToken(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  })
}

async function popoverBorderCount(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((root) => {
    const visible = (node: Element) => {
      const style = getComputedStyle(node)
      const sides = ['top', 'right', 'bottom', 'left'] as const
      return sides.some((side) => {
        const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`))
        const borderStyle = style.getPropertyValue(`border-${side}-style`)
        const color = style.getPropertyValue(`border-${side}-color`)
        if (!(width > 0) || borderStyle === 'none' || borderStyle === 'hidden') return false
        return color !== 'transparent' && !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color)
      })
    }
    let count = visible(root) ? 1 : 0
    for (const node of root.querySelectorAll('*')) {
      if (visible(node)) count += 1
    }
    return count
  })
}

test.describe('design polish low rows', () => {
  test('F6/F8/H5/H8/H11/H12 in light and dark', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme)
      await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
      const table = mainTable(page)
      await table.getByTestId('quick-filter').first().fill('')

      await page.keyboard.press('Control+k')
      const palette = page.getByTestId('command-palette')
      await expect(palette).toBeVisible()
      await page.getByTestId('palette-input').fill('Open view')
      await expect(page.getByTestId('palette-crumb')).toContainText('Open view')
      expect(await crumbColor(page)).toBe(await accentToken(page))
      const paletteRow = palette.locator('.hit').nth(1)
      await paletteRow.hover()
      const paletteHoverBg = await paletteRow.evaluate((el) => getComputedStyle(el).backgroundColor)
      await saveShot(page, `f6-f8-palette-crumb-${theme}.png`)
      await page.keyboard.press('Escape')

      const cheddar = table.getByTestId('object-row').filter({ hasText: 'Cheddar' }).first()
      await expect(cheddar).toBeVisible()
      await cheddar.click()
      await page.locator('[data-view-type="object_detail"]').first().click()
      const detail = page.getByTestId('object-detail')
      await expect(detail).toBeVisible()

      const statusChip = detail.locator('.field-chips .meta-chip').nth(1)
      await expect(statusChip).toBeVisible()
      await expect(statusChip).toHaveText(/\S/)
      const chipBox = await statusChip.boundingBox()
      expect(chipBox?.width ?? 0).toBeGreaterThan(20)

      const allergen = detail.locator('.choice-chip').first()
      await expect(allergen).toBeVisible()
      await allergen.hover()
      await saveShot(page, `h5-allergen-hover-${theme}.png`)

      const addLink = detail.getByTestId('add-link').first()
      await addLink.focus()
      await page.keyboard.press('Enter')
      const linkPicker = page.getByTestId('link-picker')
      await expect(linkPicker).toBeVisible()
      const linkRow = linkPicker.locator('.hit').first()
      await linkRow.hover()
      const linkHoverBg = await linkRow.evaluate((el) => getComputedStyle(el).backgroundColor)
      expect(linkHoverBg).toBe(paletteHoverBg)
      await saveShot(page, `h11-link-picker-hover-${theme}.png`)
      await page.keyboard.press('Escape')

      const grid = table.locator('.grid').first()
      await grid.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => grid.evaluate((el) => el.matches(':focus-visible'))).toBe(true)
      const rowOutline = await cheddar.evaluate((el) => getComputedStyle(el).outlineStyle)
      const cellShadow = await cheddar.locator('.cell.active-cell').evaluate((el) => getComputedStyle(el).boxShadow)
      expect(rowOutline).toBe('none')
      expect(cellShadow).not.toBe('none')
      await saveShot(page, `h12-grid-focus-${theme}.png`)
    }
  })

  test('H10 field picker popover has one bordered surface', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const table = mainTable(page)
    await table.getByRole('button', { name: 'Fields' }).click()
    const picker = page.getByTestId('field-picker')
    await expect(picker).toBeVisible()
    expect(await popoverBorderCount(page, 'field-picker')).toBe(1)
    await page.keyboard.press('Escape')
  })

  test('H13 pane chrome does not cover tab labels in a narrow pane', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const pane = page.locator('section.pane.focused').first()
    const tab = pane.locator('.pane-tab.active').first()
    const strip = tab.locator('xpath=ancestor::div[contains(@class,"pane-tab-list")]')
    const before = await pane.boundingBox()
    if (before) {
      const dividers = page.locator('.split-divider.horizontal')
      const count = await dividers.count()
      for (let i = 0; i < count; i += 1) {
        const box = await dividers.nth(i).boundingBox()
        if (!box) continue
        const onRight = box.x >= before.x + before.width - 12 && box.x <= before.x + before.width + 16
        if (!onRight) continue
        const y = box.y + Math.min(80, box.height / 2)
        await page.mouse.move(box.x + box.width / 2, y)
        await page.mouse.down()
        await page.mouse.move(before.x + 220, y, { steps: 12 })
        await page.mouse.up()
        break
      }
    }
    await expect.poll(async () => {
      const [tabLeft, textLeft, stripLeft, chromeLeft] = await Promise.all([
        tab.evaluate((el) => el.getBoundingClientRect().left),
        tab.locator('.pane-tab-open > span').first().evaluate((el) => el.getBoundingClientRect().left),
        strip.evaluate((el) => el.getBoundingClientRect().left),
        pane.locator('.pane-chrome').evaluate((el) => el.getBoundingClientRect().left),
      ])
      return tabLeft >= stripLeft - 1 && textLeft >= stripLeft - 1 && chromeLeft >= textLeft
    }).toBe(true)
    await saveShot(page, 'h13-narrow-pane-tabs.png')
  })
})
