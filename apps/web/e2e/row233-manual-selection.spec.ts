import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await page.locator('.pane-tab-list').getByRole('button', { name: 'Products', exact: true }).click()
  await expect(mainTable(page)).toBeVisible()
}

function rowId(row: Locator) {
  return row.getAttribute('id').then((id) => (id ?? '').replace(/^object-row-/, ''))
}

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

test('a manual selection is filled from the table and stays filled after reload', async ({ page }) => {
  await login(page)
  await openProducts(page)
  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.nth(2)).toBeVisible()

  const name = `Hand ${Date.now()}`
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New selection')
  await page.keyboard.press('Enter')
  const draft = page.getByTestId('selection-detail')
  await expect(draft).toBeVisible()
  await expect(draft.getByText('Filled by hand: select rows and choose Add to selection…, or drag them onto the selection.')).toBeVisible()
  await page.getByTestId('assortment-name').fill(name)
  await page.getByTestId('selection-kind').selectOption('manual')
  await draft.getByTestId('review-and-save').click()
  await expect(draft).toHaveCount(0)

  await openProducts(page)
  const chip = table.getByTestId('assortment').filter({ hasText: name })
  await chip.scrollIntoViewIfNeeded()
  await expect(chip).toBeVisible()

  const firstId = await rowId(rows.nth(0))
  const secondId = await rowId(rows.nth(1))
  const thirdId = await rowId(rows.nth(2))
  expect(firstId && secondId && thirdId).toBeTruthy()
  const first = table.locator(`#object-row-${firstId}`)
  const second = table.locator(`#object-row-${secondId}`)
  const third = table.locator(`#object-row-${thirdId}`)

  await first.click()
  await second.click({ modifiers: ['Control'] })
  await second.click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Add to selection…' }).click()
  const picker = page.getByTestId('selection-picker')
  await expect(picker).toBeVisible()
  await picker.getByTestId('selection-picker-input').fill(name)
  await expect(picker.getByRole('option', { name })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(picker).toHaveCount(0)
  await expect(chip).toHaveAttribute('data-member-count', '2')

  await third.click()
  await chip.scrollIntoViewIfNeeded()
  await dragOver(page, third, chip)
  await page.mouse.up()
  await expect(chip).toHaveAttribute('data-member-count', '3')
  await expect(page.getByTestId('link-create-dialog')).toHaveCount(0)

  await chip.click()
  await expect(table.getByTestId('row-count')).toContainText('3')
  await expect(table.getByTestId('object-row')).toHaveCount(3)
  await expect(table.locator(`#object-row-${firstId}`)).toBeVisible()
  await expect(table.locator(`#object-row-${secondId}`)).toBeVisible()
  await expect(table.locator(`#object-row-${thirdId}`)).toBeVisible()

  await table.locator(`#object-row-${thirdId}`).click({ button: 'right' })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Remove from selection' }).click()
  await expect(page.getByTestId('remove-selection-confirm')).toHaveCount(0)
  await expect(table.getByTestId('row-count')).toContainText('2')
  await expect(table.getByTestId('object-row')).toHaveCount(2)
  await expect(table.locator(`#object-row-${thirdId}`)).toHaveCount(0)
  await expect(chip).toHaveAttribute('data-member-count', '2')

  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await openProducts(page)
  const again = mainTable(page).getByTestId('assortment').filter({ hasText: name })
  await again.click()
  await expect(mainTable(page).getByTestId('row-count')).toContainText('2')
  await expect(mainTable(page).getByTestId('object-row')).toHaveCount(2)
  await expect(mainTable(page).locator(`#object-row-${firstId}`)).toBeVisible()
  await expect(mainTable(page).locator(`#object-row-${secondId}`)).toBeVisible()
  await expect(mainTable(page).locator(`#object-row-${thirdId}`)).toHaveCount(0)
})
