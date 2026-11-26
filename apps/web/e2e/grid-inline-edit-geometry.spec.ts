import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'
import { setTheme } from './ui'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'grid-inline-geometry-screenshots')
const agentShots = '/cursor/stores/self/screenshots'

type TextBox = { left: number; cy: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openDataModelTab(page: Page, label: string, tableTestId: string) {
  await page.getByRole('button', { name: 'Data model' }).click()
  const tab = page.locator('.pane-tab').filter({ hasText: label }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  await expect(tab).toHaveClass(/\bactive\b/)
  const table = page.getByTestId(tableTestId)
  await expect(table).toBeVisible()
  return { tab, table }
}

async function textAnchor(locator: Locator): Promise<TextBox> {
  return locator.evaluate((el) => {
    const target =
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement
        ? el
        : el.querySelector('span, input, button') ?? el
    const range = document.createRange()
    if (target instanceof HTMLInputElement && target.type !== 'checkbox') {
      const box = target.getBoundingClientRect()
      return { left: box.left, cy: box.top + box.height / 2 }
    }
    range.selectNodeContents(target)
    const rect = range.getBoundingClientRect()
    const box = target.getBoundingClientRect()
    const left = rect.width > 0 ? rect.left : box.left
    const cy = rect.height > 0 ? rect.top + rect.height / 2 : box.top + box.height / 2
    return { left, cy }
  })
}

function assertAligned(before: TextBox, after: TextBox, label: string) {
  expect(Math.abs(after.left - before.left), `${label} left edge`).toBeLessThanOrEqual(2)
  expect(Math.abs(after.cy - before.cy), `${label} vertical center`).toBeLessThanOrEqual(2)
}

async function assertTabInsideHeader(tab: Locator, header: Locator, label: string) {
  const tabBox = await tab.boundingBox()
  const headerBox = await header.boundingBox()
  if (!tabBox || !headerBox) throw new Error(`missing box for ${label}`)
  expect(tabBox.x, `${label} clipped left`).toBeGreaterThanOrEqual(headerBox.x - 0.5)
  expect(tabBox.x + tabBox.width, `${label} clipped right`).toBeLessThanOrEqual(headerBox.x + headerBox.width + 0.5)
  expect(tabBox.y, `${label} clipped top`).toBeGreaterThanOrEqual(headerBox.y - 0.5)
  expect(tabBox.y + tabBox.height, `${label} clipped bottom`).toBeLessThanOrEqual(headerBox.y + headerBox.height + 0.5)
}

async function saveShot(page: Page, name: string) {
  for (const dir of [shots, agentShots]) {
    try {
      mkdirSync(dir, { recursive: true })
      await page.screenshot({ path: join(dir, name), fullPage: false })
      return join(dir, name)
    } catch {
      // Agent store may be absent in CI.
    }
  }
  return join(shots, name)
}

test.describe('data model inline edit geometry', () => {
  test('text editor, enum dropdown and pane tab align in light and dark', async ({ page }) => {
    test.setTimeout(180_000)
    await login(page)

    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme)

      const { tab: unitsTab, table: unitsTable } = await openDataModelTab(page, 'Units', 'units-table')
      const header = page.locator('section.pane.focused .pane-tabs').first()
      await assertTabInsideHeader(unitsTab, header, `Units active tab ${theme}`)
      const unitRow = unitsTable.locator('[data-testid="standard-grid-row"]').first()
      await unitRow.click()
      const symbolCell = unitRow.locator('[data-column="symbol"]')
      const readValue = symbolCell.locator('span').first()
      await expect(readValue).toBeVisible()
      const symbolBefore = await textAnchor(readValue)
      await symbolCell.dblclick()
      const editor = symbolCell.getByTestId('standard-cell-editor')
      await expect(editor).toBeVisible()
      await expect(editor).toBeFocused()
      assertAligned(symbolBefore, await textAnchor(editor), `Units symbol ${theme}`)
      const editorPaint = await editor.evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          borderTopWidth: style.borderTopWidth,
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        }
      })
      expect(Number.parseFloat(editorPaint.borderTopWidth)).toBe(0)
      expect(editorPaint.boxShadow).toBe('none')
      await saveShot(page, `units-symbol-edit-${theme}.png`)
      await page.keyboard.press('Escape')

      const { tab: linkTab, table: linkTable } = await openDataModelTab(page, 'Link types', 'link-types-table')
      await assertTabInsideHeader(linkTab, header, `Link types active tab ${theme}`)
      const linkRow = linkTable.locator('[data-testid="standard-grid-row"]').first()
      await linkRow.click()
      const cardinalityCell = linkRow.locator('[data-column="fromCardinality"]')
      const cardinalityRead = cardinalityCell.locator('span').first()
      await expect(cardinalityRead).toBeVisible()
      const cardinalityBefore = await textAnchor(cardinalityRead)
      await cardinalityCell.dblclick()
      const dropdown = cardinalityCell.getByTestId('standard-cell-editor')
      await expect(dropdown).toBeVisible()
      assertAligned(cardinalityBefore, await textAnchor(dropdown), `Link type cardinality ${theme}`)
      await saveShot(page, `link-type-dropdown-edit-${theme}.png`)
      await page.keyboard.press('Escape')

      await saveShot(page, `pane-tab-active-${theme}.png`)

      expect(symbolBefore.left).toBeGreaterThan(0)
    }
  })
})