import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function openSecondProducts(page: Page) {
  const palette = page.getByTestId('command-palette')
  await page.keyboard.press('Control+k')
  await expect(palette).toBeVisible()
  await page.getByTestId('palette-input').fill('Add view')
  const root = palette.getByRole('option', { name: /^Add view/ }).first()
  await expect(root).toBeVisible()
  await root.click()
  await expect(page.getByTestId('palette-crumb')).toContainText('Add view ›')
  await page.getByTestId('palette-input').fill('Products view')
  const typeRow = palette.getByRole('option', { name: /^Products view/ }).first()
  await expect(typeRow).toBeVisible()
  await typeRow.click()
  await expect(palette).toHaveCount(0)
}

function productPanes(page: Page): Locator {
  return page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }),
  })
}

test('a second Products view opens beside the first and both accept a link drag', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  const first = mainTable(page)
  await first.getByTestId('object-row').first().click()
  await expect(first.getByTestId('object-row').first()).toHaveAttribute('aria-selected', 'true')

  await openSecondProducts(page)

  const panes = productPanes(page)
  await expect(panes).toHaveCount(2, { timeout: 30_000 })
  for (let index = 0; index < 2; index += 1) {
    await expect(panes.nth(index).getByTestId('object-table')).toBeVisible()
    await expect(panes.nth(index).getByTestId('object-row').first()).toBeVisible()
  }

  const boxes = await panes.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width }
    }),
  )
  expect(boxes[0]?.x).not.toBe(boxes[1]?.x)
  expect(Math.abs((boxes[0]?.y ?? 0) - (boxes[1]?.y ?? 0))).toBeLessThanOrEqual(2)
  expect(Math.abs((boxes[0]?.x ?? 0) - (boxes[1]?.x ?? 0))).toBeGreaterThan(40)

  const left = panes.nth(0)
  const right = panes.nth(1)
  const leftRow = left.getByTestId('object-row').first()
  const rightRow = right.getByTestId('object-row').first()
  await dragOver(page, leftRow, rightRow)
  const ghost = page.getByTestId('link-drag-ghost')
  await expect(ghost).toBeVisible()
  await expect(ghost).toContainText(/^Link /)
  await expect(rightRow).toHaveAttribute('data-link-drop', 'true')
  await page.mouse.up()
  const productDialog = page.getByTestId('link-create-dialog').or(page.getByTestId('link-invalid-dialog'))
  await expect(productDialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(productDialog).toHaveCount(0)

  const articles = paneWithTab(page, 'Articles').getByTestId('object-table').first()
  await expect(articles.getByTestId('object-row').first()).toBeVisible()
  const articleRow = articles.getByTestId('object-row').first()
  for (const target of [leftRow, rightRow]) {
    await dragOver(page, articleRow, target)
    await expect(target).toHaveAttribute('data-link-drop', 'true')
    await page.mouse.up()
    const dialog = page.getByTestId('link-create-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }

  const duplicateTab = right.locator('.pane-tab[data-view-type="object_table"]').first()
  await duplicateTab.hover()
  await duplicateTab.getByRole('button', { name: 'Close tab' }).click()
  await expect(productPanes(page)).toHaveCount(1)
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible()
})

async function dragOver(page: Page, source: Locator, target: Locator) {
  const start = await visiblePoint(source)
  const end = await visiblePoint(target)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const hop = await source.evaluate((el, origin) => {
    const candidates = [
      { x: origin.x + 24, y: origin.y },
      { x: origin.x - 24, y: origin.y },
      { x: origin.x, y: origin.y + 8 },
    ]
    for (const point of candidates) {
      const hit = document.elementFromPoint(point.x, point.y)
      if (hit && el.contains(hit)) return point
    }
    return { x: origin.x + 24, y: origin.y }
  }, start)
  await page.mouse.move(hop.x, hop.y)
  await page.mouse.move(end.x, end.y)
}

async function visiblePoint(locator: Locator) {
  const point = await locator.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const midX = Math.min(box.left + box.width / 2, window.innerWidth - 2)
    const midY = Math.min(box.top + box.height / 2, window.innerHeight - 2)
    const mid = document.elementFromPoint(midX, midY)
    if (mid && el.contains(mid)) return { x: midX, y: midY }
    const right = Math.min(box.right - 2, window.innerWidth - 2)
    const bottom = Math.min(box.bottom - 2, window.innerHeight - 2)
    for (let y = box.top + 4; y <= bottom; y += 6) {
      for (let x = box.left + 8; x <= right; x += 16) {
        const hit = document.elementFromPoint(x, y)
        if (hit && el.contains(hit)) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('missing drag point')
  return point
}
