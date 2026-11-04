import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

type Paint = {
  accent: string
  accentHover: string
  outlineStyle: string
  outlineWidth: string
  boxShadow: string
  backgroundColor: string
  visibleBorder: boolean
  afterBoxShadow: string
}

async function paint(locator: Locator): Promise<Paint> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el)
    const after = getComputedStyle(el, '::after')
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const accent = getComputedStyle(probe).color
    probe.style.color = 'var(--accent-hover)'
    const accentHover = getComputedStyle(probe).color
    probe.remove()
    const sides = ['top', 'right', 'bottom', 'left'] as const
    const visibleBorder = sides.some((side) => {
      const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`))
      const borderStyle = style.getPropertyValue(`border-${side}-style`)
      const color = style.getPropertyValue(`border-${side}-color`)
      if (!(width > 0) || borderStyle === 'none' || borderStyle === 'hidden') return false
      return color !== 'transparent' && !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color)
    })
    return {
      accent,
      accentHover,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      visibleBorder,
      afterBoxShadow: after.boxShadow,
    }
  })
}

/** Split a computed box-shadow list without breaking commas inside rgb()/rgba(). */
function shadows(value: string): string[] {
  if (value === 'none') return []
  return value.split(/,(?![^()]*\))/).map((part) => part.trim())
}

test.describe('nested chrome', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`${theme}: one indicator on the row, pane, cell, and detail field`, async ({ page }) => {
      await login(page)
      await setTheme(page, theme)
      const table = mainTable(page)
      const filter = table.getByTestId('quick-filter').first()
      if ((await filter.inputValue()) !== '') await filter.fill('')
      const selected = table.getByTestId('object-row').filter({ hasText: 'Cheddar' }).first()
      const other = table.getByTestId('object-row').nth(1)
      await expect(selected).toBeVisible()
      await selected.click()
      await expect(selected).toHaveAttribute('aria-selected', 'true')

      const selectedPaint = await paint(selected)
      const otherPaint = await paint(other)
      // Accent policy: selection is the dim fill plus exactly one 3px accent left edge.
      expect(selectedPaint.outlineStyle).toBe('none')
      expect(selectedPaint.outlineWidth).toBe('0px')
      expect(selectedPaint.visibleBorder).toBe(false)
      expect(selectedPaint.afterBoxShadow).toBe('none')
      expect(shadows(selectedPaint.boxShadow)).toEqual([
        `${selectedPaint.accent} 3px 0px 0px 0px inset`,
      ])
      expect(selectedPaint.backgroundColor).not.toBe(otherPaint.backgroundColor)

      const cell = selected.locator('.cell.active-cell')
      expect((await paint(cell)).boxShadow).toBe('none')

      const grid = table.locator('[role="grid"]').first()
      await grid.focus()
      await page.keyboard.press('ArrowRight')
      await expect.poll(() => grid.evaluate((el) => el.matches(':focus-visible'))).toBe(true)

      const pane = page.locator('section.pane.focused').first()
      const panePaint = await paint(pane)
      expect(panePaint.outlineStyle).toBe('none')
      expect(panePaint.afterBoxShadow).toBe('none')
      const gridPaint = await paint(grid)
      expect(gridPaint.outlineStyle).toBe('none')
      // The focused cell adds its own hover-accent ring, not a second left-edge marker.
      const focusedCellPaint = await paint(cell)
      const focusedCellShadows = shadows(focusedCellPaint.boxShadow)
      expect(focusedCellShadows).toHaveLength(1)
      expect(focusedCellShadows[0]).toContain('inset')
      expect(focusedCellShadows[0]).toContain(focusedCellPaint.accentHover)
      expect(focusedCellShadows[0]).not.toContain('3px')

      await page.locator('[data-view-type="object_detail"]').first().click()
      const detail = page.getByTestId('object-detail')
      for (const label of ['Name', 'Description', 'Ingredients']) {
        const field = detail.locator('.field').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}\\b`) }) }).first()
        await expect(field).toBeVisible()
        const input = field.locator('input, textarea').first()
        const card = field.locator('xpath=ancestor::section[contains(@class,"field-card")][1]')
        const nesting = await input.evaluate((el) => {
          const visible = (node: Element) => {
            const style = getComputedStyle(node)
            const sides = ['top', 'right', 'bottom', 'left'] as const
            const border = sides.some((side) => {
              const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`))
              const borderStyle = style.getPropertyValue(`border-${side}-style`)
              const color = style.getPropertyValue(`border-${side}-color`)
              if (!(width > 0) || borderStyle === 'none' || borderStyle === 'hidden') return false
              return color !== 'transparent' && !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color)
            })
            const outline = style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0
            const shadow = style.boxShadow !== 'none'
            return border || outline || shadow
          }
          const between: string[] = []
          let node: Element | null = el.parentElement
          while (node && !(node instanceof HTMLElement && node.classList.contains('field-card'))) {
            if (visible(node)) between.push(node instanceof HTMLElement ? node.className || node.tagName : node.tagName)
            node = node.parentElement
          }
          return { inputBoxed: visible(el), cardBoxed: node ? visible(node) : false, between }
        })
        expect(nesting.cardBoxed, label).toBe(false)
        expect(nesting.inputBoxed, label).toBe(false)
        expect(nesting.between, label).toEqual([])
        const tag = field.locator('.lang-tag')
        await expect(tag).toHaveText('en')
        const tagPaint = await paint(tag)
        expect(tagPaint.visibleBorder).toBe(false)
        expect(tagPaint.boxShadow).toBe('none')
        expect(tagPaint.backgroundColor).toBe('rgba(0, 0, 0, 0)')
        expect((await paint(card)).visibleBorder).toBe(false)
      }

      await page.locator('[data-view-type="object_detail"]').first().focus()
      await page.keyboard.press('Tab')
      const ring = await page.evaluate(() => {
        const el = document.activeElement
        if (!(el instanceof HTMLElement) || !el.matches(':focus-visible')) return null
        const style = getComputedStyle(el)
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
        }
      })
      expect(ring).not.toBeNull()
      expect(ring?.outlineStyle).not.toBe('none')
      expect(ring?.outlineWidth).toBeGreaterThan(0)
    })
  }
})