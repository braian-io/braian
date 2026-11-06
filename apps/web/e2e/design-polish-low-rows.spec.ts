import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'design-polish-screenshots')
const agentShots = '/cursor/stores/self/screenshots'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function saveShot(page: Page, name: string) {
  for (const dir of [shots, agentShots]) {
    try {
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: join(dir, name), fullPage: false })
      return
    } catch {
      // Agent store may be absent in CI; test-results is enough there.
    }
  }
}

async function crumbColor(page: Page) {
  return page.getByTestId('palette-crumb').evaluate((el) => getComputedStyle(el).color)
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
      const active = palette.locator('.hit.on')
      await expect(active).toContainText('Open view')
      await expect(palette.locator('.hit.on')).toHaveCount(1)
      const activeRow = active.first()
      const activePaint = await activeRow.evaluate((el) => {
        const style = getComputedStyle(el)
        const mark = el.querySelector('.mark')
        const markStyle = mark ? getComputedStyle(mark) : null
        return {
          color: style.color,
          text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
          markBg: markStyle?.backgroundColor ?? '',
          markWeight: markStyle?.fontWeight ?? '',
        }
      })
      expect(activePaint.markWeight).toMatch(/6[0-9]{2}|700|bold/)
      expect(activePaint.markBg).toBe('rgba(0, 0, 0, 0)')
      await page.keyboard.press('Tab')
      await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
      expect(await crumbColor(page)).toBe(await accentToken(page))
      const paletteHoverTarget = palette.locator('.hit:not(.on):not(.ask)').first()
      await expect(paletteHoverTarget).toBeVisible()
      const weakPurple = await page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.backgroundColor = 'color-mix(in srgb, var(--accent-dim) 55%, transparent)'
        document.body.appendChild(probe)
        const value = getComputedStyle(probe).backgroundColor
        probe.remove()
        return value
      })
      await page.mouse.move(5, 5)
      const hoverBox = await paletteHoverTarget.boundingBox()
      if (!hoverBox) throw new Error('palette hover target has no box')
      await page.mouse.move(hoverBox.x + hoverBox.width / 2, hoverBox.y + hoverBox.height / 2)
      await expect
        .poll(async () => {
          return paletteHoverTarget.evaluate((el) => ({
            bg: getComputedStyle(el).backgroundColor,
            hover: el.matches(':hover'),
            className: el.className,
            selected: el.getAttribute('data-selected'),
          }))
        })
        .toMatchObject({ bg: weakPurple, hover: true })
      const paletteActiveShadow = await palette.locator('.hit.on').first().evaluate((el) => getComputedStyle(el).boxShadow)
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
      await expect(allergen).not.toHaveClass(/\bon\b/)
      await allergen.hover()
      const hoverPaint = await allergen.evaluate((el) => {
        const style = getComputedStyle(el)
        return { bg: style.backgroundColor, color: style.color, weight: style.fontWeight }
      })
      expect(hoverPaint.weight).not.toMatch(/6[0-9]{2}|700|bold/)
      await saveShot(page, `h5-allergen-hover-${theme}.png`)

      const addLink = detail.getByTestId('add-link').first()
      await addLink.focus()
      await page.keyboard.press('Enter')
      const linkPicker = page.getByTestId('link-picker')
      await expect(linkPicker).toBeVisible()
      await page.getByTestId('link-search').fill('ART')
      const linkActive = linkPicker.locator('.hit.on').first()
      await expect(linkActive).toBeVisible({ timeout: 30_000 })
      const linkShadow = await linkActive.evaluate((el) => getComputedStyle(el).boxShadow)
      expect(linkShadow).toBe(paletteActiveShadow)
      await saveShot(page, `h11-link-picker-active-${theme}.png`)
      await page.keyboard.press('Escape')

      await page.mouse.move(8, 8)
      await cheddar.click()
      const grid = table.locator('.grid').first()
      await grid.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => grid.evaluate((el) => el.matches(':focus-visible')), { timeout: 30_000 }).toBe(true)
      const rowOutline = await cheddar.evaluate((el) => getComputedStyle(el).outlineStyle)
      const cellShadow = await cheddar.locator('.cell.active-cell').evaluate((el) => getComputedStyle(el).boxShadow)
      expect(rowOutline).toBe('none')
      expect(cellShadow).not.toBe('none')
      await saveShot(page, `h12-grid-focus-${theme}.png`)
    }
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
