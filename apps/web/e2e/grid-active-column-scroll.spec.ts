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
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
}

function rowByName(page: Page, name: RegExp | string) {
  return mainTable(page).getByTestId('object-row').filter({ hasText: name }).first()
}

async function setNameCell(page: Page, row: Locator, text: string) {
  await row.locator('[data-column="name"]').first().dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill(text)
  await editor.press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
  await mainTable(page).getByTestId('review-and-save').click()
  await expect
    .poll(async () => (await rowByName(page, text).locator('[data-column="name"]').textContent())?.trim() ?? '', {
      timeout: 30_000,
    })
    .toBe(text)
}

async function expectActiveCellVisibleInGrid(grid: Locator) {
  await expect
    .poll(async () =>
      grid.evaluate((el) => {
        const cell = el.querySelector<HTMLElement>('.row .cell.active-cell')
        if (!cell) return false
        const g = el.getBoundingClientRect()
        const c = cell.getBoundingClientRect()
        let left = g.left
        for (const probe of el.querySelectorAll<HTMLElement>('.head .cell, .row .cell')) {
          const style = getComputedStyle(probe)
          if (style.position !== 'sticky') continue
          const stickLeft = Number.parseFloat(style.left) || 0
          if (stickLeft > 0.5) continue
          const rect = probe.getBoundingClientRect()
          if (Math.abs(rect.left - (g.left + stickLeft)) > 2) continue
          left = Math.max(left, rect.right)
        }
        return c.left >= left - 1 && c.right <= g.right + 1
      }),
    )
    .toBe(true)
}

test('ArrowRight scrolls the active column into view; Enter opens inline edit', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)

  const original = 'Mature cheddar'
  const draftText = 'Keyboard enter edit'
  const row = rowByName(page, original)
  await expect(row).toBeVisible({ timeout: 60_000 })
  const rowId = await row.getAttribute('id')
  expect(rowId).toMatch(/^object-row-/)
  const stableRow = page.locator(`[id="${rowId}"]`)

  const table = mainTable(page)
  const grid = table.locator('.grid').first()

  try {
    await grid.evaluate((el) => {
      el.dataset.testNarrowGrid = '1'
      el.style.width = '260px'
      el.style.maxWidth = '260px'
    })

    await grid.focus()
    await page.keyboard.press('ArrowDown')
    await expect(stableRow.locator('.cell.active-cell')).toBeVisible()

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('ArrowRight')
      await expectActiveCellVisibleInGrid(grid)
    }

    const lastColumn = await stableRow.locator('.cell.active-cell').getAttribute('data-column')
    expect(lastColumn).toBeTruthy()

    while ((await stableRow.locator('.cell.active-cell').getAttribute('data-column')) !== 'name') {
      await page.keyboard.press('ArrowLeft')
      await expectActiveCellVisibleInGrid(grid)
    }

    await page.keyboard.press('Enter')
    const editor = page.getByTestId('cell-editor-name')
    await expect(editor).toBeVisible()
    await editor.fill(draftText)
    await editor.press('Enter')
    await expect(editor).toHaveCount(0)
    await expect(stableRow.locator('[data-column="name"]').getByTestId('cell-diff')).toContainText(draftText)

    await page.keyboard.press('Enter')
    const editor2 = page.getByTestId('cell-editor-name')
    await expect(editor2).toBeVisible()
    await editor2.fill('Should not stick')
    await editor2.press('Escape')
    await expect(editor2).toHaveCount(0)
    await expect(stableRow.locator('[data-column="name"]').getByTestId('cell-diff')).toContainText(draftText)
    await expect(grid).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expectActiveCellVisibleInGrid(grid)
  } finally {
    await grid.evaluate((el) => {
      if (el.dataset.testNarrowGrid) {
        el.style.width = ''
        el.style.maxWidth = ''
        delete el.dataset.testNarrowGrid
      }
    })
    await openProducts(page)
    const current = rowByName(page, new RegExp(`${original}|${draftText}|Should not stick`))
    if (await current.count()) {
      const name = (await current.locator('[data-column="name"]').textContent())?.trim() ?? ''
      const diff = current.locator('[data-column="name"]').getByTestId('cell-diff')
      if (name !== original || (await diff.count()) > 0) {
        await setNameCell(page, current, original)
      }
    }
  }
})