import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

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
  color: string
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
      color: style.color,
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

type RingClip = {
  accent: string
  outline: string
  outlineWidth: number
  outlineOffset: number
  outlineColor: string
  boxShadow: string
  ring: { left: number; top: number; right: number; bottom: number }
  clipped: { side: string; ancestor: string }[]
}

/**
 * The ring is an outline (outside for offset >= 0, inside for a negative offset)
 * or an outer box-shadow spread. Walk the ancestors and report every overflow
 * clip that would cut the ring's bounding box.
 */
async function ringClip(locator: Locator): Promise<RingClip> {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const width = style.outlineStyle === 'none' ? 0 : Number.parseFloat(style.outlineWidth) || 0
    const offset = style.outlineStyle === 'none' ? 0 : Number.parseFloat(style.outlineOffset) || 0
    let spread = 0
    if (style.boxShadow !== 'none') {
      const layers: string[] = []
      let depth = 0
      let start = 0
      for (let i = 0; i < style.boxShadow.length; i += 1) {
        const ch = style.boxShadow[i]
        if (ch === '(') depth += 1
        else if (ch === ')') depth -= 1
        else if (ch === ',' && depth === 0) {
          layers.push(style.boxShadow.slice(start, i))
          start = i + 1
        }
      }
      layers.push(style.boxShadow.slice(start))
      for (const layer of layers) {
        const lengths = layer.trim().split(/\s+/).filter((part) => /^[-+]?[0-9.]+px$/.test(part)).map((part) => Number(part.slice(0, -2)))
        const blur = lengths.length >= 3 ? lengths[2] : 0
        const layerSpread = lengths.length >= 4 ? lengths[3] : 0
        if (blur === 0 && layerSpread > spread) spread = layerSpread
      }
    }
    const reach = Math.max(width + offset, spread)
    const ring = {
      left: rect.left - reach,
      top: rect.top - reach,
      right: rect.right + reach,
      bottom: rect.bottom + reach,
    }
    const clipped: { side: string; ancestor: string }[] = []
    let node = el.parentElement
    while (node) {
      const s = getComputedStyle(node)
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const r = node.getBoundingClientRect()
        const clip = {
          left: r.left + (Number.parseFloat(s.borderLeftWidth) || 0),
          right: r.right - (Number.parseFloat(s.borderRightWidth) || 0),
          top: r.top + (Number.parseFloat(s.borderTopWidth) || 0),
          bottom: r.bottom - (Number.parseFloat(s.borderBottomWidth) || 0),
        }
        const sides: [string, boolean][] = [
          ['left', ring.left < clip.left - 0.5],
          ['right', ring.right > clip.right + 0.5],
          ['top', ring.top < clip.top - 0.5],
          ['bottom', ring.bottom > clip.bottom + 0.5],
        ]
        const ancestor = `${node.tagName}.${String(node.className).split(' ').slice(0, 3).join('.')}`
        for (const [side, hit] of sides) {
          if (hit) clipped.push({ side, ancestor })
        }
      }
      node = node.parentElement
    }
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.appendChild(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    return {
      accent,
      outline: style.outlineStyle === 'none' ? 'none' : `${style.outlineWidth} ${style.outlineStyle} ${style.outlineOffset}`,
      outlineWidth: width,
      outlineOffset: offset,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      ring,
      clipped,
    }
  })
}

function expectRingUnclipped(locator: Locator, label: string) {
  return ringClip(locator).then((value) => {
    expect(value.clipped, `${label}: ${JSON.stringify(value)}`).toEqual([])
    return value
  })
}

async function tabUntilFocused(page: Page, locator: Locator, max = 60) {
  for (let step = 0; step < max; step += 1) {
    const focused = await locator.evaluate((el) => el === document.activeElement)
    if (focused) return true
    await page.keyboard.press('Tab')
  }
  return false
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

async function cssToken(page: Page, name: string) {
  return page.evaluate((token) => {
    const probe = document.createElement('span')
    probe.style.backgroundColor = `var(${token})`
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  }, name)
}

async function cssColor(page: Page, name: string) {
  return page.evaluate((token) => {
    const probe = document.createElement('span')
    probe.style.color = `var(${token})`
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).color
    probe.remove()
    return value
  }, name)
}

function alphaOf(color: string) {
  const match = color.match(/rgba?\(([^)]+)\)/)
  if (!match) return 1
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return parts.length === 4 ? (parts[3] ?? 1) : 1
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
  const selectedRowPaint = await paint(productRow)
  expect(selectedRowPaint.backgroundColor).toBe(selectedRowPaint.accentDim)
  expect(selectedRowPaint.boxShadow).toContain('3px 0px 0px 0px inset')
  expect(selectedRowPaint.boxShadow).toContain(selectedRowPaint.accent)
  const grid = table.locator('.grid').first()
  await grid.focus()
  const cell = table.locator('.row.selected .cell.active-cell').first()
  await expect(cell).toBeVisible()
  const beforeColumn = await cell.getAttribute('data-column')
  expect(beforeColumn).toBeTruthy()
  const columns = await table
    .locator('.head .cell[data-column]')
    .evaluateAll((cells) => cells.map((element) => element.getAttribute('data-column')))
  // Move away from the clicked column in whichever direction has a neighbour.
  const step = columns.indexOf(beforeColumn) > 0 ? 'ArrowLeft' : 'ArrowRight'
  await page.keyboard.press(step)
  await expect.poll(() => grid.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
  // The 2px accent ring follows the active cell while the selected row keeps its fill.
  await expect.poll(() => cell.getAttribute('data-column')).not.toBe(beforeColumn)
  const selectedAfterArrow = await paint(productRow)
  expect(selectedAfterArrow.backgroundColor).toBe(selectedAfterArrow.accentDim)
  expect(selectedAfterArrow.boxShadow).toContain('3px 0px 0px 0px inset')
  const cellPaint = await paint(cell)
  expectOneIndicator(cellPaint, 'focused table cell')
  expect(cellPaint.outlineStyle).toBe('none')
  expect(cellPaint.boxShadow).toContain('0px 0px 0px 2px inset')
  expect(cellPaint.boxShadow).toContain(cellPaint.accent)
  expect(cellPaint.boxShadow).not.toContain(cellPaint.accentHover)
  console.log('row135 focus evidence', JSON.stringify({
    activeCellShadow: cellPaint.boxShadow,
    activeCellOutline: cellPaint.outlineStyle,
    selectedRowShadow: selectedAfterArrow.boxShadow,
    selectedRowBackground: selectedAfterArrow.backgroundColor,
    accent: cellPaint.accent,
    accentHover: cellPaint.accentHover,
  }))
  await screenshotElement(page, cell, 'table-cell-focused')

  const search = table.locator('.search-field').first()
  await page.mouse.move(5, 5)
  const searchRest = await paint(search)
  await search.hover()
  const searchPaint = await paint(search)
  // Hover is a soft fill, not a focus mark: no 2px accent ring appears until the field is focused.
  expect(indicators(searchPaint).count, JSON.stringify(indicators(searchPaint))).toBe(0)
  expect(searchPaint.outlineStyle).toBe('none')
  expect(searchPaint.boxShadow).not.toContain(searchPaint.accent)
  expect(searchPaint.boxShadow).not.toContain('2px')
  expect(searchPaint.visibleBorder).toBe(false)
  expect(searchPaint.backgroundColor).not.toBe(searchRest.backgroundColor)
  await screenshotElement(page, search, 'search-field-hovered')
})

test('Account and the active pane tab are reachable by Tab without a click', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)

  const userMenu = page.getByTestId('user-menu')
  const activeOpen = page.locator('section.pane.focused .pane-tab.active .pane-tab-open').first()
  await expect(userMenu).toHaveAttribute('aria-label', 'Account')
  await expect(activeOpen).toBeVisible()

  const focused = (target: Locator) => target.evaluate((element) => element === document.activeElement)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

  let accountStep = -1
  let activeTabStep = -1
  for (let step = 1; step <= 200 && (accountStep < 0 || activeTabStep < 0); step += 1) {
    await page.keyboard.press('Tab')
    if (accountStep < 0 && await focused(userMenu)) {
      accountStep = step
      const value = await paint(userMenu)
      expectOneIndicator(value, 'Account keyboard focus')
      expect(value.outlineStyle).not.toBe('none')
      expect(value.outlineWidth).toBe(2)
      expect(value.boxShadow).not.toContain(value.accent)
      await screenshotElement(page, userMenu, 'tab-account-focused')
    }
    if (activeTabStep < 0 && await focused(activeOpen)) {
      activeTabStep = step
      const value = await paint(activeOpen)
      expectOneIndicator(value, 'active pane tab keyboard focus')
      expect(value.outlineStyle).not.toBe('none')
      expect(value.outlineWidth).toBe(2)
      expect(value.outlineOffset).toBeLessThanOrEqual(0)
      expect(value.boxShadow).not.toContain(value.accent)
      await screenshotElement(page, activeOpen, 'tab-active-pane-focused')
    }
  }
  expect(accountStep, 'Account must be reachable by Tab from the page start').toBeGreaterThan(0)
  expect(activeTabStep, 'The active pane tab must be reachable by Tab from the page start').toBeGreaterThan(0)
  console.log('row135 follow-up tab evidence', JSON.stringify({ accountStep, activeTabStep }))
})

test('Tab shows one keyboard ring on the user menu, tree and table', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  const treeTab = page.locator('.pane-tab', { hasText: 'Food' }).first()
  if ((await treeTab.count()) > 0) await treeTab.click()
  const tree = page.getByTestId('structure-tree').first()
  await expect(tree).toBeVisible()
  const userMenu = page.getByTestId('user-menu')
  const grid = table.locator('.grid').first()
  const targets = {
    userMenu: '[data-testid="user-menu"]',
    tree: '[data-testid="structure-tree"]',
    grid: '.grid',
  }
  const seen = new Set<string>()
  const activeMatches = (selector: string) =>
    page.evaluate((value) => document.activeElement instanceof Element && document.activeElement.matches(value), selector)

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let step = 0; step < 400 && seen.size < 3; step += 1) {
    await page.keyboard.press('Tab')
    for (const [name, selector] of Object.entries(targets)) {
      if (seen.has(name)) continue
      if (!(await activeMatches(selector))) continue
      seen.add(name)
      if (name === 'userMenu') {
        const value = await paint(userMenu)
        expectOneIndicator(value, 'user menu keyboard focus')
        expect(value.outlineStyle).not.toBe('none')
        expect(value.outlineWidth).toBe(2)
        expect(value.outlineOffset).toBeLessThanOrEqual(0)
        expect(value.boxShadow).not.toContain(value.accent)
        console.log('row135 tab evidence user-menu', JSON.stringify({
          outline: `${value.outlineWidth}px ${value.outlineStyle} ${value.outlineOffset}px`,
          shadow: value.boxShadow,
          accent: value.accent,
        }))
        await screenshotElement(page, userMenu, 'tab-user-menu-focused')
      }
      if (name === 'tree') {
        const value = await paint(tree)
        expectOneIndicator(value, 'tree keyboard focus')
        expect(value.outlineStyle).not.toBe('none')
        expect(value.outlineWidth).toBe(2)
        expect(value.outlineOffset).toBe(-2)
        expect(value.boxShadow).not.toContain(value.accent)
        console.log('row135 tab evidence tree', JSON.stringify({
          outline: `${value.outlineWidth}px ${value.outlineStyle} ${value.outlineOffset}px`,
          shadow: value.boxShadow,
          accent: value.accent,
        }))
        await screenshotElement(page, tree, 'tab-tree-focused')
      }
      if (name === 'grid') {
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => grid.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
        const activeCell = table.locator('.row.active .cell.active-cell').first()
        await expect(activeCell).toBeVisible()
        const value = await paint(activeCell)
        expectOneIndicator(value, 'tab table keyboard focus')
        expect(value.outlineStyle).toBe('none')
        expect(value.boxShadow).toContain('0px 0px 0px 2px inset')
        expect(value.boxShadow).toContain(value.accent)
        expect(value.boxShadow).not.toContain(value.accentHover)
        const gridPaint = await paint(grid)
        expect(gridPaint.outlineStyle).toBe('none')
        console.log('row135 tab evidence grid', JSON.stringify({
          activeCellShadow: value.boxShadow,
          gridOutline: gridPaint.outlineStyle,
          accent: value.accent,
        }))
        await screenshotElement(page, activeCell, 'tab-grid-cell-focused')
      }
    }
  }
  expect([...seen].sort()).toEqual(['grid', 'tree', 'userMenu'])
})

test('search field focus draws a flush accent ring on the field', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  const search = table.locator('.search-field').first()
  const input = table.getByTestId('quick-filter').first()
  await expect(search).toBeVisible()

  await page.mouse.move(5, 5)
  await input.click()
  await expect(input).toBeFocused()

  const focused = await paint(search)
  expectOneIndicator(focused, 'focused search field')
  expect(focused.outlineStyle).toBe('none')
  expect(focused.boxShadow).toContain(focused.accent)
  expect(focused.boxShadow).toContain('2px')
  expect(focused.visibleBorder).toBe(false)
  expect((await paint(input)).outlineStyle).toBe('none')
  await screenshotElement(page, search, 'search-field-focused')
})

test('column header hover changes text only, with no fill box', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  const header = table.locator('.head .cell.column-header-cell').first()
  const button = header.locator('.column-header-btn').first()
  await expect(button).toBeVisible()

  await page.mouse.move(5, 5)
  const rest = await paint(button)
  const restCell = await paint(header)
  expect(restCell.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(rest.color).toBe(await cssColor(page, '--muted'))

  const buttonBox = await button.boundingBox()
  const cellBox = await header.boundingBox()
  if (!buttonBox || !cellBox) throw new Error('missing header or button box')
  // Stay over the label, clear of the resize handle on the trailing edge.
  await page.mouse.move(buttonBox.x + Math.min(24, buttonBox.width / 2), buttonBox.y + buttonBox.height / 2)
  await expect.poll(async () => (await paint(button)).color).toBe(await cssColor(page, '--text'))
  const hover = await paint(button)
  const hoverCell = await paint(header)
  expect(hover.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(hoverCell.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(hoverCell.boxShadow).toBe(restCell.boxShadow)
  expect(hover.color).not.toBe(rest.color)

  expect(buttonBox.x).toBeGreaterThanOrEqual(cellBox.x)
  expect(buttonBox.y).toBeGreaterThanOrEqual(cellBox.y)
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cellBox.x + cellBox.width + 1)
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(cellBox.y + cellBox.height + 1)
  await screenshotElement(page, header, 'column-header-hover')
})

test('accent policy: selection, hover, menus, chips and light dim', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  const selectedRow = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(selectedRow).toBeVisible({ timeout: 60_000 })
  await selectedRow.click()
  await expect(selectedRow).toHaveAttribute('aria-selected', 'true')
  await page.mouse.move(5, 5)

  const selected = await paint(selectedRow)
  expect(selected.backgroundColor).toBe(selected.accentDim)
  expect(selected.boxShadow).toContain('inset')
  expect(selected.boxShadow).toContain('3px')
  expect(selected.boxShadow).toContain(selected.accent)
  expect(selected.outlineStyle).toBe('none')
  await screenshotElement(page, selectedRow, 'accent-selected-row-dark')

  const hoverColor = await cssToken(page, '--hover')
  const hoverRow = table.getByTestId('object-row').filter({ hasNotText: 'PROD-CHEDDAR' }).first()
  await expect(hoverRow).toBeVisible()
  await hoverRow.hover()
  await expect.poll(async () => (await paint(hoverRow)).backgroundColor).toBe(hoverColor)
  const hovered = await paint(hoverRow)
  expect(hovered.backgroundColor).not.toBe(selected.accentDim)
  expect(hovered.boxShadow).not.toContain('inset')
  await screenshotElement(page, hoverRow, 'accent-hovered-row-dark')

  await selectedRow.click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  const marked = menu.locator('[data-highlighted]')
  await expect(marked).toHaveCount(1)
  const markedPaint = await paint(marked.first())
  expect(markedPaint.backgroundColor).toBe(markedPaint.accentDim)
  const unmarked = menu.locator('[role="menuitem"]:not([data-highlighted])')
  const unmarkedCount = await unmarked.count()
  expect(unmarkedCount).toBeGreaterThan(0)
  for (let index = 0; index < unmarkedCount; index += 1) {
    const item = await paint(unmarked.nth(index))
    expect(item.backgroundColor).toBe('rgba(0, 0, 0, 0)')
  }
  const menuButtonShadow = await menu
    .getByRole('menuitem')
    .first()
    .evaluate((element) => getComputedStyle(element).boxShadow)
  expect(menuButtonShadow).toBe('none')
  await screenshotElement(page, menu, 'accent-context-menu-dark')
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  const chip = table.getByTestId('standard-table-filters').getByRole('button', { name: 'All', exact: true })
  await expect(chip).toBeVisible()
  await chip.hover()
  const chipPaint = await paint(chip)
  // Active chip ('All') uses a 1px accent border as its selected marker.
  expect(chipPaint.boxShadow).toContain('inset')
  expect(chipPaint.boxShadow).toContain('1px')
  await chip.click()
  expect(await chip.evaluate((element) => element.matches(':focus-visible'))).toBe(false)
  expect(await chip.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none')
  await screenshotElement(page, chip, 'accent-chip-mouse-click-dark')

  const darkAlpha = alphaOf(await cssToken(page, '--accent-dim'))
  await setTheme(page, 'light')
  const lightAlpha = alphaOf(await cssToken(page, '--accent-dim'))
  expect(lightAlpha).toBeGreaterThan(darkAlpha)
})

test('context menu keeps focus and highlight on one item', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  const row = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.click()
  await expect(row).toHaveAttribute('aria-selected', 'true')

  const expectOneMarked = async (menu: Locator, label: string) => {
    const items = menu.getByRole('menuitem')
    const count = await items.count()
    expect(count, `${label}: item count`).toBeGreaterThan(2)
    const marked: number[] = []
    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index)
      const isMarked = await item.evaluate((element) => element.hasAttribute('data-highlighted'))
      const value = await paint(item)
      expect(indicators(value).outline, `${label}: item ${index} outline`).toBe(false)
      if (isMarked) {
        marked.push(index)
        expect(value.backgroundColor, `${label}: item ${index} fill`).toBe(value.accentDim)
      } else {
        expect(value.backgroundColor, `${label}: item ${index} background`).toBe('rgba(0, 0, 0, 0)')
      }
    }
    expect(marked, `${label}: marked items`).toHaveLength(1)
    return marked[0]
  }

  const checkMenu = async (label: string, open: () => Promise<void>) => {
    await open()
    const menu = page.getByTestId('context-menu')
    await expect(menu).toBeVisible()
    const items = menu.getByRole('menuitem')
    // Menu item fills have a short CSS transition; retry until settled.
    await expect(async () => expect(await expectOneMarked(menu, `${label} opened`)).toBe(0)).toPass({ timeout: 5_000 })
    await screenshotElement(page, menu, `${label}-open`)

    await items.nth(1).hover()
    // Menu item fills have a short CSS transition; retry until settled.
    await expect(async () => expect(await expectOneMarked(menu, `${label} hovered`)).toBe(1)).toPass({ timeout: 5_000 })
    await screenshotElement(page, menu, `${label}-hover`)

    await page.keyboard.press('ArrowDown')
    // Menu item fills have a short CSS transition; retry until settled.
    await expect(async () => expect(await expectOneMarked(menu, `${label} arrow down`)).toBe(2)).toPass({ timeout: 5_000 })
    await screenshotElement(page, menu, `${label}-arrow-down`)

    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
  }

  await checkMenu('context-menu-mouse', async () => {
    await row.click({ button: 'right' })
  })

  await checkMenu('context-menu-keyboard', async () => {
    await row.click()
    await expect(row).toHaveAttribute('aria-selected', 'true')
    const grid = table.locator('.grid').first()
    await grid.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+F10')
  })
})

for (const passTheme of ['dark', 'light'] as const) test(`pointer selection accents the column header; keyboard adds the underline (${passTheme})`, async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript((t) => localStorage.setItem('braian.theme', JSON.stringify(t)), passTheme)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  const row = table.getByTestId('object-row').filter({ hasText: 'PROD-CHEDDAR' }).first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  const grid = table.locator('.grid').first()

  const assertTheme = async (theme: 'dark' | 'light') => {
    await setTheme(page, theme)
    await page.mouse.move(5, 5)
    const cell = row.locator('.cell').nth(1)
    await cell.click()
    await expect(row).toHaveAttribute('aria-selected', 'true')
    const column = await cell.getAttribute('data-column')
    if (!column) throw new Error('missing clicked column')
    expect(await grid.evaluate((element) => element.matches(':focus-within'))).toBe(true)
    await expect.poll(() => grid.evaluate((element) => element.matches(':focus-visible'))).toBe(false)

    const header = table.locator('.head .cell.column-active')
    const headerButton = header.locator('.column-header-btn')
    await expect(header).toHaveAttribute('data-column', column)
    await expect(header).toBeVisible()
    // The pointer marks the active column with accent text only; no ring or underline.
    await expect.poll(async () => {
      const value = await paint(headerButton)
      return value.color === value.accent
    }).toBe(true)
    const pointerHeader = await paint(header)
    expect(indicators(pointerHeader).count, `pointer header ${theme}`).toBe(0)
    expect(pointerHeader.outlineStyle).toBe('none')
    expect(pointerHeader.boxShadow).toBe('none')

    const pointerCell = table.locator('.row.selected .cell.active-cell').first()
    await expect(pointerCell).toHaveAttribute('data-column', column)
    const pointerCellPaint = await paint(pointerCell)
    expect(indicators(pointerCellPaint).count, `pointer active cell ${theme}`).toBe(0)
    expect(pointerCellPaint.outlineStyle).toBe('none')
    expect(pointerCellPaint.boxShadow).toBe('none')
    await screenshotElement(page, header, `grid-pointer-header-${theme}`)
    await screenshotElement(page, pointerCell, `grid-pointer-cell-${theme}`)

    await page.keyboard.press('ArrowRight')
    await expect.poll(() => grid.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
    const keyboardHeader = table.locator('.head .cell.column-active')
    await expect.poll(async () => (await paint(keyboardHeader)).boxShadow.includes('inset')).toBe(true)
    const keyboardColumn = await keyboardHeader.getAttribute('data-column')
    const keyboardHeaderPaint = await paint(keyboardHeader)
    expectOneIndicator(keyboardHeaderPaint, `keyboard header ${theme}`)
    expect(keyboardHeaderPaint.outlineStyle).toBe('none')
    expect(keyboardHeaderPaint.boxShadow).toContain('inset')
    expect(keyboardHeaderPaint.boxShadow).toContain('2px')
    // Header text color has a CSS transition; wait for the settled value.
    await expect.poll(async () => (await paint(keyboardHeader.locator('.column-header-btn'))).color).toBe(keyboardHeaderPaint.accent)

    const keyboardCell = table.locator('.row.selected .cell.active-cell').first()
    await expect(keyboardCell).toHaveAttribute('data-column', keyboardColumn ?? '')
    const keyboardCellPaint = await paint(keyboardCell)
    expectOneIndicator(keyboardCellPaint, `keyboard active cell ${theme}`)
    expect(keyboardCellPaint.outlineStyle).toBe('none')
    expect(keyboardCellPaint.boxShadow).toContain('0px 0px 0px 2px inset')
    expect(keyboardCellPaint.boxShadow).toContain(keyboardCellPaint.accent)
    expect(keyboardCellPaint.boxShadow).not.toContain(keyboardCellPaint.accentHover)
    await screenshotElement(page, keyboardHeader, `grid-keyboard-header-${theme}`)
    await screenshotElement(page, keyboardCell, `grid-keyboard-cell-${theme}`)
  }

  // One theme per test: a fresh page keeps the browser focus modality in pointer mode.
  await assertTheme(passTheme)
})

test('standard grid selected row carries the accent edge', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.getByRole('button', { name: 'Data model' }).click()
  const tab = page.locator('.pane-tab').filter({ hasText: 'Object types' }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  const table = page.getByTestId('object-types-table')
  await expect(table).toBeVisible()
  const rows = table.locator('.standard-grid-row')
  await expect(rows.first()).toBeVisible()

  const assertTheme = async (theme: 'dark' | 'light') => {
    await setTheme(page, theme)
    await page.mouse.move(5, 5)
    const selected = rows.first()
    await selected.click()
    await expect(selected).toHaveClass(/\bon\b/)
    const selectPaint = await paint(selected)
    expect(selectPaint.backgroundColor).toBe(selectPaint.accentDim)
    expect(selectPaint.boxShadow).toContain('inset')
    expect(selectPaint.boxShadow).toContain('3px')
    expect(selectPaint.boxShadow).toContain(selectPaint.accent)
    expect(selectPaint.outlineStyle).toBe('none')
    await screenshotElement(page, selected, `standard-grid-selected-${theme}`)

    const hoverRow = rows.nth(1)
    await expect(hoverRow).toBeVisible()
    await page.mouse.move(5, 5)
    await hoverRow.hover()
    const hoverColor = await cssToken(page, '--hover')
    await expect.poll(async () => (await paint(hoverRow)).backgroundColor).toBe(hoverColor)
    const hovered = await paint(hoverRow)
    expect(hovered.backgroundColor).not.toBe(hovered.accentDim)
    expect(hovered.boxShadow).not.toContain('inset')
    await screenshotElement(page, hoverRow, `standard-grid-hover-${theme}`)
  }

  await assertTheme('dark')
  await assertTheme('light')
})

for (const passTheme of ['dark', 'light'] as const) test(`flat icon buttons and chips use an accent hover (${passTheme})`, async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript((t) => localStorage.setItem('braian.theme', JSON.stringify(t)), passTheme)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

  const icon = table.getByTestId('table-add-row')
  const filters = table.getByTestId('standard-table-filters')
  const inactive = filters.getByRole('button', { name: 'Type', exact: true })
  const active = filters.getByRole('button', { name: 'All', exact: true })
  await expect(icon).toBeVisible()
  await expect(inactive).toBeVisible()
  await active.click()
  await expect(active).toHaveClass(/\bon\b/)

  const accentDim = await cssToken(page, '--accent-dim')
  const filterChipHover = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.background = 'color-mix(in srgb, var(--accent-dim) 55%, transparent)'
    document.body.appendChild(probe)
    const value = getComputedStyle(probe).backgroundColor
    probe.remove()
    return value
  })

  const expectRest = async (target: Locator, label: string, name: string) => {
    await page.mouse.move(5, 5)
    const value = await paint(target)
    expect(value.backgroundColor, `${label} ${passTheme} rest background`).toBe('rgba(0, 0, 0, 0)')
    expect(value.boxShadow, `${label} ${passTheme} rest shadow`).toBe('none')
    await screenshotElement(page, target, `${name}-rest-${passTheme}`)
  }

  const expectHover = async (target: Locator, label: string, name: string, hoverBg = accentDim) => {
    await page.mouse.move(5, 5)
    await target.hover()
    // The fill has a short CSS transition; retry until it settles on the accent wash.
    await expect.poll(async () => (await paint(target)).backgroundColor).toBe(hoverBg)
    const value = await paint(target)
    expect(value.boxShadow, `${label} ${passTheme} hover shadow`).toBe('none')
    expect(value.outlineStyle, `${label} ${passTheme} hover outline`).toBe('none')
    expect(value.visibleBorder, `${label} ${passTheme} hover border`).toBe(false)
    await screenshotElement(page, target, `${name}-hover-${passTheme}`)
  }

  await expectRest(icon, 'add icon button', 'icon-button')
  await expectRest(inactive, 'inactive chip', 'inactive-chip')
  await expectHover(icon, 'add icon button', 'icon-button')
  await expectHover(inactive, 'inactive chip', 'inactive-chip', filterChipHover)

  await page.mouse.move(5, 5)
  const activePaint = await paint(active)
  // Selected marker is a 1px accent border; text stays readable (--text).
  expect(activePaint.backgroundColor, `active chip ${passTheme} fill`).toBe('rgba(0, 0, 0, 0)')
  expect(activePaint.boxShadow, `active chip ${passTheme} shadow`).toContain('inset')
  expect(activePaint.boxShadow, `active chip ${passTheme} accent`).toContain('1px')
  await expect.poll(async () => (await paint(active)).color).not.toBe(activePaint.accent)
  await screenshotElement(page, active, `active-chip-${passTheme}`)
})

async function dragTabToPane(page: Page, title: string, pane: Locator) {
  const tab = page.locator('.pane-tab', { hasText: title }).first()
  await expect(tab).toBeVisible()
  const tabBox = await tab.boundingBox()
  const paneBox = await pane.boundingBox()
  if (!tabBox || !paneBox) throw new Error(`missing ${title} tab or pane`)
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(paneBox.x + paneBox.width / 2, paneBox.y + paneBox.height / 2, { steps: 16 })
  await expect(page.getByTestId('drop-center')).toBeVisible()
  await page.mouse.up()
}

for (const passTheme of ['dark', 'light'] as const) test(`tab close target grows and appears on hover (${passTheme})`, async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript((t) => localStorage.setItem('braian.theme', JSON.stringify(t)), passTheme)
  await login(page)

  const productsPane = page.locator('section.pane').filter({
    has: page.locator('.pane-tab', { hasText: 'Products' }),
  }).first()
  await dragTabToPane(page, 'Articles', productsPane)

  const pane = page.locator('section.pane').filter({
    has: page.locator('.pane-tab', { hasText: 'Products' }),
  }).filter({
    has: page.locator('.pane-tab', { hasText: 'Articles' }),
  }).first()
  await expect(pane.locator('.pane-tab')).toHaveCount(2)
  const productsTab = pane.locator('.pane-tab', { hasText: 'Products' }).first()
  const articlesTab = pane.locator('.pane-tab', { hasText: 'Articles' }).first()
  const inactive = (await productsTab.evaluate((el) => el.classList.contains('active'))) ? articlesTab : productsTab
  await expect(inactive).not.toHaveClass(/active/)

  const close = inactive.locator('.tab-x')
  await page.mouse.move(5, 5)
  await expect.poll(async () => close.evaluate((el) => getComputedStyle(el).opacity)).toBe('0')
  expect(await close.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none')
  await screenshotElement(page, inactive, `tab-close-hidden-${passTheme}`)

  const tabs = pane.locator('.pane-tab')
  const before = await tabs.count()
  // Hidden + pointer-events:none: nothing at the close slot may be a .tab-x.
  const tabBox = await inactive.boundingBox()
  if (!tabBox) throw new Error('missing inactive tab box')
  const topHit = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    return el instanceof Element ? { tag: el.tagName, className: el.className } : null
  }, { x: tabBox.x + tabBox.width - 11, y: tabBox.y + tabBox.height / 2 })
  expect(String(topHit?.className ?? '')).not.toContain('tab-x')
  await expect(tabs).toHaveCount(before)

  await page.mouse.move(5, 5)
  await inactive.hover()
  await expect.poll(async () => close.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')
  const shown = await close.evaluate((el) => {
    const style = getComputedStyle(el)
    const probe = document.createElement('span')
    probe.style.color = 'var(--text-2)'
    document.body.appendChild(probe)
    const expected = getComputedStyle(probe).color
    probe.remove()
    return { pointerEvents: style.pointerEvents, color: style.color, expected }
  })
  expect(shown.pointerEvents).toBe('auto')
  expect(shown.color).toBe(shown.expected)
  const hit = await close.boundingBox()
  if (!hit) throw new Error('missing hovered close target box')
  expect(hit.width).toBeGreaterThanOrEqual(20)
  expect(hit.height).toBeGreaterThanOrEqual(20)
  await screenshotElement(page, inactive, `tab-close-hovered-${passTheme}`)
})

test('top nav tab ring is fully visible', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  const firstTab = page.locator('nav.tabs .tab').first()
  await expect(firstTab).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Tab')
  await expect(firstTab).toBeFocused()
  await page.waitForTimeout(250)
  const clip = await expectRingUnclipped(firstTab, 'top nav tab')
  expect(clip.outline).not.toBe('none')
  expect(clip.outlineWidth).toBe(2)
  expect(clip.outlineColor).toBe(clip.accent)
  await screenshotElement(page, firstTab, 'row135-top-nav-tab-unclipped')
})

test('search field Tab focus ring is fully visible', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  const input = table.getByTestId('quick-filter').first()
  await expect(input).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const reached = await tabUntilFocused(page, input)
  expect(reached, 'quick filter reachable by Tab from the page start').toBe(true)
  await expect(input).toBeFocused()
  const field = input.locator('xpath=ancestor::label[contains(@class,"search-field")]')
  const clip = await expectRingUnclipped(field, 'search field')
  expect(clip.boxShadow).toContain(clip.accent)
  expect(clip.boxShadow).toContain('2px')
  expect(clip.outline).toBe('none')
  await screenshotElement(page, field, 'row135-search-unclipped')
})

test('active pane tab and its close X keep fully visible rings', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  const activeOpen = page.locator('section.pane.focused .pane-tab.active .pane-tab-open').first()
  await expect(activeOpen).toBeVisible()
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  const reached = await tabUntilFocused(page, activeOpen)
  expect(reached, 'active pane tab reachable by Tab from the page start').toBe(true)
  await expect(activeOpen).toBeFocused()
  await page.waitForTimeout(250)
  const openClip = await expectRingUnclipped(activeOpen, 'active pane tab')
  expect(openClip.outline).not.toBe('none')
  expect(openClip.outlineWidth).toBe(2)
  expect(openClip.outlineColor).toBe(openClip.accent)
  await screenshotElement(page, activeOpen, 'row135-active-tab-unclipped')

  const activeTab = page.locator('section.pane.focused .pane-tab.active').first()
  const close = activeTab.locator('.tab-x')
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.waitForTimeout(250)
  const closeClip = await expectRingUnclipped(close, 'active tab close X')
  expect(closeClip.outline).not.toBe('none')
  expect(closeClip.outlineWidth).toBe(2)
  expect(closeClip.outlineColor).toBe(closeClip.accent)
  await screenshotElement(page, activeTab, 'row135-tab-x-unclipped')
})

test('user menu arrow-focused item shows the accent ring', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  const userMenu = page.getByTestId('user-menu')
  const reached = await tabUntilFocused(page, userMenu)
  expect(reached, 'user menu reachable by Tab').toBe(true)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('user-menu-content')).toBeVisible()
  await page.keyboard.press('ArrowDown')
  const item = page.locator('[data-testid="user-menu-content"] [data-highlighted]').first()
  await expect(item).toBeVisible()
  await expect(item).toBeFocused()
  // Arrow navigation may leave :focus-visible unset; the ring must follow the
  // highlighted item regardless, so assert the painted outline itself.
  const clip = await expectRingUnclipped(item, 'arrow-focused user menu item')
  expect(clip.outline).not.toBe('none')
  expect(clip.outlineWidth).toBe(2)
  expect(clip.outlineColor).toBe(clip.accent)
  await screenshotElement(page, page.getByTestId('user-menu-content'), 'row135-user-menu-arrow-ring')
  await page.keyboard.press('Escape')
})

test('data model tree focus and Shift+Tab keep visible rings', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => localStorage.setItem('braian.theme', JSON.stringify('dark')))
  await login(page)
  const treeTab = page.locator('.pane-tab', { hasText: 'Food' }).first()
  await expect(treeTab).toBeVisible()
  await treeTab.click()
  const tree = page.getByTestId('structure-tree').first()
  await expect(tree).toBeVisible({ timeout: 30_000 })
  const reached = await tabUntilFocused(page, tree, 80)
  expect(reached, 'data model tree reachable by Tab').toBe(true)
  await page.waitForTimeout(250)
  const treeClip = await expectRingUnclipped(tree, 'data model tree')
  expect(treeClip.outline).not.toBe('none')
  expect(treeClip.outlineWidth).toBe(2)
  expect(treeClip.outlineColor).toBe(treeClip.accent)
  await screenshotElement(page, tree, 'row135-tree-unclipped')

  await page.keyboard.press('Shift+Tab')
  await page.waitForTimeout(250)
  const shift = await page.evaluate(() => {
    const el = document.activeElement
    if (!(el instanceof HTMLElement)) return null
    const style = getComputedStyle(el)
    return {
      tag: el.tagName,
      testid: el.dataset.testid ?? null,
      matchesFocusVisible: el.matches(':focus-visible'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
    }
  })
  expect(shift, 'Shift+Tab leaves the tree for a real control').not.toBeNull()
  expect(shift?.matchesFocusVisible, "Shift+Tab target isn't focus-visible").toBe(true)
  expect(shift?.outlineStyle, 'Shift+Tab target has no outline').not.toBe('none')
  expect(Number.parseFloat(shift?.outlineWidth ?? '0'), 'Shift+Tab target outline width').toBeGreaterThan(0)
  await screenshotElement(page, page.locator('body'), 'row135-shift-tab')
})
