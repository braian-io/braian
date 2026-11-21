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

function objectParam(page: Page) {
  return new URL(page.url()).searchParams.get('object')
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
        const cell = el.querySelector<HTMLElement>('.cell.active-cell')
        if (!cell) return false
        const row = cell.closest<HTMLElement>('.row')
        if (!row) return false
        let cellLeft = 0
        let width = 0
        for (const probe of row.querySelectorAll<HTMLElement>('.cell')) {
          const w = probe.offsetWidth
          if (probe === cell) {
            width = w
            break
          }
          cellLeft += w
        }
        const cellRight = cellLeft + width
        let inset = 0
        if (el.scrollLeft > 0) {
          for (const probe of row.querySelectorAll<HTMLElement>('.cell')) {
            const style = getComputedStyle(probe)
            if (style.position !== 'sticky') break
            const stickLeft = Number.parseFloat(style.left) || 0
            if (stickLeft > 0.5) break
            inset += probe.offsetWidth
          }
        }
        const viewLeft = el.scrollLeft + inset
        const viewRight = el.scrollLeft + el.clientWidth
        return cellLeft >= viewLeft - 1 && cellRight <= viewRight + 1
      }),
    )
    .toBe(true)
}

test('grid focus alone does not select; arrows select Detail; Enter/Space confirm; Left/Right move the column', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()

  const table = mainTable(page)
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
  // No row is selected on a fresh workspace; Detail shows its empty state.
  await expect(page.getByTestId('detail-empty')).toBeVisible()

  const grid = table.locator('.grid').first()
  const first = rows.first()
  const second = rows.nth(1)
  const firstRowId = await first.getAttribute('id')
  const secondRowId = await second.getAttribute('id')
  expect(firstRowId).toBeTruthy()
  expect(secondRowId).toBeTruthy()

  // Focusing/Tabbing into the grid must not select or open the first row.
  await grid.focus()
  expect(await grid.evaluate((element) => element.matches(':focus'))).toBe(true)
  await expect(page.getByTestId('detail-empty')).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(grid).toHaveAttribute('aria-activedescendant', firstRowId!)
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('detail-empty')).toHaveCount(0)
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect(page.getByTestId('detail-loading')).toHaveCount(0)
  const firstObjectId = firstRowId!.replace(/^object-row-/, '')
  const firstKey = (await first.locator('[data-column="number"], [data-column="key"]').first().innerText()).trim()
  expect(firstKey).not.toBe('')
  expect(firstKey).not.toBe(firstObjectId)
  await expect.poll(() => objectParam(page)).toBe(firstKey)

  // Another arrow moves selection and Detail together.
  await page.keyboard.press('ArrowDown')
  await expect(grid).toHaveAttribute('aria-activedescendant', secondRowId!)
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(first).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect(page.getByTestId('detail-loading')).toHaveCount(0)
  const secondObjectId = secondRowId!.replace(/^object-row-/, '')
  const secondKey = (await second.locator('[data-column="number"], [data-column="key"]').first().innerText()).trim()
  expect(secondKey).not.toBe(secondObjectId)
  await expect.poll(() => objectParam(page)).toBe(secondKey)
  const secondName = (await second.locator('[data-column="name"]').innerText()).trim()
  const firstName = (await first.locator('[data-column="name"]').innerText()).trim()
  await expect.poll(async () => (await page.getByTestId('object-detail').locator('.detail-title strong').innerText()).trim()).toBe(secondName)

  const detailTitle = async () => (await page.getByTestId('object-detail').locator('.detail-title strong').innerText()).trim()
  const selectedRows = table.getByTestId('object-row').and(table.locator('[aria-selected="true"]'))

  // Shift+Arrow extends the range. Space confirms only the focused row.
  await page.keyboard.press('Shift+ArrowUp')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect.poll(detailTitle).toBe(firstName)
  await page.keyboard.press('Space')
  await expect(selectedRows).toHaveCount(1)
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(second).toHaveAttribute('aria-selected', 'false')
  await expect.poll(() => objectParam(page)).toBe(firstKey)
  await expect.poll(detailTitle).toBe(firstName)

  // Enter confirms only the focused row after another extended move.
  await page.keyboard.press('Shift+ArrowDown')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Enter')
  await expect(selectedRows).toHaveCount(1)
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect(first).toHaveAttribute('aria-selected', 'false')
  await expect.poll(() => objectParam(page)).toBe(secondKey)
  await expect.poll(detailTitle).toBe(secondName)

  // Left/Right still move the active cell on the focused row.
  const activeCell = second.locator('.cell.active-cell')
  await expect(activeCell).toHaveCount(1)
  const before = await activeCell.getAttribute('data-column')
  expect(before).toBeTruthy()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => second.locator('.cell.active-cell').getAttribute('data-column')).not.toBe(before)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => second.locator('.cell.active-cell').getAttribute('data-column')).toBe(before)
})

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
    await table.evaluate((el) => {
      el.dataset.testNarrowGrid = '1'
      el.style.width = '220px'
      el.style.maxWidth = '220px'
      el.style.overflow = 'hidden'
      const grid = el.querySelector<HTMLElement>('.grid')
      if (grid) {
        grid.style.width = '220px'
        grid.style.maxWidth = '220px'
        grid.style.minWidth = '220px'
        grid.style.flex = '0 0 auto'
      }
    })
    await expect.poll(async () => grid.evaluate((el) => el.scrollWidth > el.clientWidth + 4)).toBe(true)

    await stableRow.locator('[data-column="number"], [data-column="key"]').first().click()
    await grid.focus()
    await expect.poll(async () => grid.getAttribute('aria-activedescendant')).toBe(rowId)
    await expect(stableRow.locator('.cell.active-cell')).toBeVisible()

    const startColumn = await stableRow.locator('.cell.active-cell').getAttribute('data-column')
    expect(startColumn).toBeTruthy()
    let column = startColumn
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('ArrowRight')
      await expect
        .poll(async () => stableRow.locator('.cell.active-cell').getAttribute('data-column'))
        .not.toBe(column)
      const next = await stableRow.locator('.cell.active-cell').getAttribute('data-column')
      if (!next) break
      column = next
      await expectActiveCellVisibleInGrid(grid)
    }
    expect(column).not.toBe(startColumn)

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
    await table.evaluate((el) => {
      if (el.dataset.testNarrowGrid) {
        el.style.width = ''
        el.style.maxWidth = ''
        el.style.overflow = ''
        const grid = el.querySelector<HTMLElement>('.grid')
        if (grid) {
          grid.style.width = ''
          grid.style.maxWidth = ''
          grid.style.minWidth = ''
          grid.style.flex = ''
        }
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
