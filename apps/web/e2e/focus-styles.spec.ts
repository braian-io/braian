import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'focus-screenshots')

type Paint = {
  accent: string
  accentHover: string
  accentDim: string
  outlineStyle: string
  outlineWidth: number
  outlineOffset: number
  boxShadow: string
  backgroundColor: string
  visibleBorder: boolean
  borderBottomColor: string
  borderBottomStyle: string
  borderBottomWidth: number
  borderRadius: string
  after: {
    backgroundColor: string
    borderRadius: string
    height: number
  }
}

async function paint(target: Locator): Promise<Paint> {
  return target.evaluate((element) => {
    const style = getComputedStyle(element)
    const after = getComputedStyle(element, '::after')
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const accent = getComputedStyle(probe).color
    probe.style.color = 'var(--accent-hover)'
    const accentHover = getComputedStyle(probe).color
    probe.style.backgroundColor = 'var(--accent-dim)'
    const accentDim = getComputedStyle(probe).backgroundColor
    probe.remove()
    const px = (value: string) => Number.parseFloat(value)
    const sides = ['top', 'right', 'bottom', 'left'] as const
    const visible = (side: (typeof sides)[number]) => {
      const width = px(style.getPropertyValue(`border-${side}-width`))
      const borderStyle = style.getPropertyValue(`border-${side}-style`)
      const color = style.getPropertyValue(`border-${side}-color`)
      if (!(width > 0) || borderStyle === 'none' || borderStyle === 'hidden') return false
      return color !== 'transparent' && !/^rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)$/.test(color)
    }
    return {
      accent,
      accentHover,
      accentDim,
      outlineStyle: style.outlineStyle,
      outlineWidth: px(style.outlineWidth),
      outlineOffset: px(style.outlineOffset),
      boxShadow: style.boxShadow,
      backgroundColor: style.backgroundColor,
      visibleBorder: sides.some(visible),
      borderBottomColor: style.borderBottomColor,
      borderBottomStyle: style.borderBottomStyle,
      borderBottomWidth: px(style.borderBottomWidth),
      borderRadius: style.borderRadius,
      after: {
        backgroundColor: after.backgroundColor,
        borderRadius: after.borderRadius,
        height: px(after.height),
      },
    }
  })
}

function indicators(value: Paint) {
  const outline = value.outlineStyle !== 'none' && value.outlineWidth > 0
  const border =
    value.borderBottomWidth > 0
    && value.borderBottomStyle !== 'none'
    && value.borderBottomColor === value.accent
  const shadow =
    value.boxShadow !== 'none'
    && (value.boxShadow.includes(value.accent) || value.boxShadow.includes(value.accentHover))
  const underline = value.after.height > 0 && value.after.backgroundColor === value.accent
  return { outline, border, shadow, underline, count: [outline, border, shadow, underline].filter(Boolean).length }
}

function expectOneIndicator(value: Paint, label: string) {
  const found = indicators(value)
  expect(found.count, `${label}: ${JSON.stringify(found)}`).toBe(1)
  if (found.outline) expect(value.outlineOffset, `${label} outline offset`).toBeLessThanOrEqual(0)
}

async function screenshotElement(page: Page, target: Locator, name: string) {
  const box = await target.boundingBox()
  if (!box) throw new Error(`missing box for ${name}`)
  mkdirSync(shots, { recursive: true })
  const viewport = page.viewportSize() ?? { width: 1440, height: 900 }
  const pad = 10
  const x = Math.max(0, box.x - pad)
  const y = Math.max(0, box.y - pad)
  await page.screenshot({
    path: join(shots, `${name}.png`),
    clip: {
      x,
      y,
      width: Math.min(viewport.width - x, box.width + pad * 2),
      height: Math.min(viewport.height - y, box.height + pad * 2),
    },
  })
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
  await expect(page.locator('.pane-tab', { hasText: 'Products' })).toBeVisible()
}

async function openCheddar(page: Page) {
  const table = mainTable(page)
  const row = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.click()
  await expect(row).toHaveAttribute('aria-selected', 'true')
  await page.locator('[data-view-type="object_detail"]').first().click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  return { table, detail }
}

test('focus and hover use one indicator aligned to the element', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const { table, detail } = await openCheddar(page)

  const nameField = detail
    .locator('.field')
    .filter({ has: page.locator('label', { hasText: /^Name$/ }) })
    .first()
  const nameInput = nameField.locator('input').first()
  await expect(nameInput).toBeVisible()
  const nameBefore = await paint(nameInput)
  await page.mouse.move(5, 5)
  await nameInput.click()
  await expect(nameInput).toBeFocused()
  const nameFocused = await paint(nameInput)
  expectOneIndicator(nameFocused, 'Detail Name input')
  expect(nameFocused.outlineStyle).toBe('none')
  expect(nameFocused.outlineOffset).toBeLessThanOrEqual(0)
  expect(nameFocused.borderBottomColor).toBe(nameFocused.accent)
  expect(nameFocused.borderBottomStyle).toBe('solid')
  expect(nameFocused.backgroundColor).toBe(nameBefore.backgroundColor)
  const cardBackground = await nameField
    .locator('xpath=ancestor::section[contains(@class,"field-card")][1]')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(nameFocused.backgroundColor).toBe(cardBackground)
  await screenshotElement(page, nameInput, 'detail-name-input')

  await nameInput.evaluate((element) => (element as HTMLElement).blur())
  await page.mouse.move(5, 5)
  await nameInput.hover()
  const nameHovered = await paint(nameInput)
  expectOneIndicator(nameHovered, 'Detail Name input hover')
  expect(nameHovered.outlineStyle).toBe('none')
  expect(nameHovered.borderBottomColor).toBe(nameHovered.accent)
  expect(nameHovered.borderBottomStyle).toBe('solid')
  await screenshotElement(page, nameInput, 'detail-name-input-hover')

  const langTag = nameField.locator('.lang-tag').first()
  await expect(langTag).toHaveText('en')
  const tagBox = await langTag.boundingBox()
  const inputBox = await nameInput.boundingBox()
  if (!tagBox || !inputBox) throw new Error('missing language chip or input box')
  expect(tagBox.x + tagBox.width).toBeLessThanOrEqual(inputBox.x)
  const tagCenter = tagBox.y + tagBox.height / 2
  const inputCenter = inputBox.y + inputBox.height / 2
  expect(Math.abs(tagCenter - inputCenter)).toBeLessThanOrEqual(2)
  await screenshotElement(page, nameField.locator('.lang-row').first(), 'language-chip')

  const numberField = detail
    .locator('.field')
    .filter({ has: page.locator('label', { hasText: /^Number$/ }) })
    .first()
  const identityNumber = numberField.locator('input').first()
  await expect(identityNumber).toBeVisible()
  await identityNumber.click()
  await expect(identityNumber).toBeFocused()
  const number = await paint(identityNumber)
  expectOneIndicator(number, 'Identity Number input')
  expect(number.outlineStyle).toBe('none')
  await screenshotElement(page, identityNumber, 'identity-number-focused')

  await page.mouse.move(5, 5)
  const focusedPane = page.locator('section.pane.focused').first()
  const activeTab = focusedPane.locator('.pane-tab.active').first()
  await expect(activeTab).toBeVisible()
  const active = await paint(activeTab)
  expectOneIndicator(active, 'active pane tab')
  expect(active.outlineStyle).toBe('none')
  expect(active.boxShadow).toBe('none')
  expect(Number.parseFloat(active.after.borderRadius)).toBe(0)
  expect(active.after.backgroundColor).toBe(active.accent)
  expect(active.backgroundColor).toBe(active.accentDim)
  await screenshotElement(page, activeTab, 'pane-tab-active')

  const otherTab = focusedPane.locator('.pane-tab:not(.active)').first()
  await expect(otherTab).toBeVisible()
  await otherTab.hover()
  const hoveredTab = await paint(otherTab)
  expect(indicators(hoveredTab).count).toBe(0)
  expect(hoveredTab.outlineStyle).toBe('none')
  expect(hoveredTab.boxShadow).toBe('none')
  expect(hoveredTab.visibleBorder).toBe(false)
  expect(hoveredTab.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  const hoveredText = await paint(otherTab.locator('.pane-tab-open'))
  expect(hoveredText.outlineStyle).toBe('none')
  expect(hoveredText.boxShadow).toBe('none')
  expect(hoveredText.visibleBorder).toBe(false)
  expect(hoveredText.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  await screenshotElement(page, otherTab, 'pane-tab-hover')

  const treeTab = page.locator('.pane-tab', { hasText: 'Food' }).first()
  await expect(treeTab).toBeVisible()
  await treeTab.click()
  await expect(treeTab).toHaveClass(/active/)
  await expect(treeTab.locator('xpath=ancestor::section[contains(@class,"pane")][1]')).toHaveClass(/focused/)
  await page.mouse.move(5, 5)
  // Background has a CSS transition from the hover fill; wait for the settled value.
  await expect.poll(async () => {
    const p = await paint(treeTab)
    return p.backgroundColor === p.accentDim
  }).toBe(true)
  const tree = await paint(treeTab)
  expectOneIndicator(tree, 'active tree tab')
  expect(tree.outlineStyle).toBe('none')
  expect(tree.boxShadow).toBe('none')
  expect(tree.backgroundColor).toBe(tree.accentDim)
  expect(Number.parseFloat(tree.after.borderRadius)).toBe(0)
  await screenshotElement(page, treeTab, 'tree-tab-active')

  const unfocusedActive = page.locator('section.pane:not(.focused) .pane-tab.active').first()
  await expect(unfocusedActive).toBeVisible()
  const unfocused = await paint(unfocusedActive)
  expectOneIndicator(unfocused, 'active tab in unfocused pane')
  expect(unfocused.outlineStyle).toBe('none')
  expect(unfocused.boxShadow).toBe('none')
  expect(unfocused.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(Number.parseFloat(unfocused.after.borderRadius)).toBe(0)
  await screenshotElement(page, unfocusedActive, 'pane-tab-active-unfocused')

  const productRow = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(productRow).toBeVisible()
  await productRow.click()
  await expect(productRow).toHaveAttribute('aria-selected', 'true')
  const grid = table.locator('.grid').first()
  await grid.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => grid.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  const cell = table.locator('.row.selected .cell.active-cell').first()
  await expect(cell).toBeVisible()
  const cellPaint = await paint(cell)
  expectOneIndicator(cellPaint, 'focused table cell')
  expect(cellPaint.outlineStyle).toBe('none')
  expect(cellPaint.boxShadow).toContain('inset')
  await screenshotElement(page, cell, 'table-cell-focused')

  const search = table.locator('.search-field').first()
  await page.mouse.move(5, 5)
  await search.hover()
  const searchPaint = await paint(search)
  expectOneIndicator(searchPaint, 'hovered search field')
  expect(searchPaint.outlineStyle).not.toBe('none')
  expect(searchPaint.outlineOffset).toBeLessThanOrEqual(0)
  expect(searchPaint.visibleBorder).toBe(false)
  await screenshotElement(page, search, 'search-field-hovered')
})
