import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type RowInView = {
  inView: boolean
  viewportTop: number
  viewportBottom: number
  rowTop: number
  rowBottom: number
  scrollTop: number
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
}

async function openProducts(page: Page) {
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page)
  const grid = table.locator('.grid').first()
  await expect(table.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  await grid.focus()
  return { table, grid }
}

async function activeRowViewportState(grid: Locator): Promise<RowInView | null> {
  return grid.evaluate((gridEl) => {
    const head = gridEl.querySelector<HTMLElement>('.head')
    const gridRect = gridEl.getBoundingClientRect()
    const viewportTop = head?.getBoundingClientRect().bottom ?? gridRect.top
    const viewportBottom = gridRect.bottom
    const activeId = gridEl.getAttribute('aria-activedescendant')
    const row = activeId ? document.getElementById(activeId) : null
    if (!row) return null
    const rowRect = row.getBoundingClientRect()
    return {
      inView: rowRect.top >= viewportTop - 0.5 && rowRect.bottom <= viewportBottom + 0.5,
      viewportTop,
      viewportBottom,
      rowTop: rowRect.top,
      rowBottom: rowRect.bottom,
      scrollTop: gridEl.scrollTop,
    }
  })
}

async function expectActiveRowInView(grid: Locator, label: string): Promise<void> {
  let snapshot: RowInView | null = null
  await expect
    .poll(
      async () => {
        snapshot = await activeRowViewportState(grid)
        return snapshot?.inView ?? false
      },
      { message: `${label}: active row inside grid viewport`, timeout: 15_000, intervals: [30, 50, 80, 120, 200] },
    )
    .toBe(true)
  expect(snapshot, `${label}: active row should exist`).not.toBeNull()
}

async function pressArrowDownAndAssert(grid: Locator, page: Page, step: number) {
  await page.keyboard.press('ArrowDown')
  await expectActiveRowInView(grid, `ArrowDown step ${step}`)
}

async function moveUntilActiveRowAtBottomEdge(grid: Locator, page: Page) {
  for (let step = 0; step < 80; step += 1) {
    const state = await activeRowViewportState(grid)
    expect(state, 'active row should exist while seeking bottom edge').not.toBeNull()
    const gap = state!.viewportBottom - state!.rowBottom
    if (Math.abs(gap) <= 3) return state!
    await page.keyboard.press('ArrowDown')
    await expectActiveRowInView(grid, `seek bottom edge step ${step + 1}`)
  }
  throw new Error('active row never reached bottom viewport edge')
}

async function moveUntilActiveRowAtTopEdge(grid: Locator, page: Page) {
  for (let step = 0; step < 80; step += 1) {
    const state = await activeRowViewportState(grid)
    expect(state, 'active row should exist while seeking top edge').not.toBeNull()
    const gap = state!.rowTop - state!.viewportTop
    if (Math.abs(gap) <= 3) return state!
    await page.keyboard.press('ArrowUp')
    await expectActiveRowInView(grid, `seek top edge step ${step + 1}`)
  }
  throw new Error('active row never reached top viewport edge')
}

test('Products table: each ArrowDown keeps the active row inside the scroll viewport', async ({ page }) => {
  test.setTimeout(180_000)
  const { grid } = await openProducts(page)

  await page.keyboard.press('ArrowDown')
  await expectActiveRowInView(grid, 'initial ArrowDown')

  for (let step = 2; step <= 36; step += 1) {
    await pressArrowDownAndAssert(grid, page, step)
  }

  for (let burst = 0; burst < 12; burst += 1) {
    await page.keyboard.press('ArrowDown', { delay: 20 })
    await expectActiveRowInView(grid, `burst step ${burst + 1}`)
  }
})

test('Products table: ArrowUp after scrolling keeps the active row inside the viewport', async ({ page }) => {
  test.setTimeout(180_000)
  const { grid } = await openProducts(page)

  for (let step = 1; step <= 28; step += 1) {
    await page.keyboard.press('ArrowDown')
    await expectActiveRowInView(grid, `down step ${step}`)
  }

  for (let step = 1; step <= 10; step += 1) {
    await page.keyboard.press('ArrowUp')
    await expectActiveRowInView(grid, `up step ${step}`)
  }
})

test('Products table: ArrowDown past the bottom edge scrolls ~one row and stays bottom-aligned', async ({ page }) => {
  test.setTimeout(180_000)
  const { grid } = await openProducts(page)

  await page.keyboard.press('ArrowDown')
  await expectActiveRowInView(grid, 'first ArrowDown')

  const before = await moveUntilActiveRowAtBottomEdge(grid, page)
  const rowHeight = before.rowBottom - before.rowTop
  const bodyHeight = before.viewportBottom - before.viewportTop

  await page.keyboard.press('ArrowDown')
  await expectActiveRowInView(grid, 'ArrowDown past bottom edge')
  const after = await activeRowViewportState(grid)
  expect(after, 'active row after bottom-edge ArrowDown').not.toBeNull()

  const scrollDelta = after!.scrollTop - before.scrollTop
  expect(scrollDelta).toBeGreaterThan(0)
  expect(scrollDelta).toBeLessThanOrEqual(rowHeight + 6)
  expect(Math.abs(after!.viewportBottom - after!.rowBottom)).toBeLessThan(6)
  expect(after!.rowTop - after!.viewportTop).toBeGreaterThan(bodyHeight * 0.35)
})

test('Products table: ArrowUp past the top edge scrolls ~one row and stays top-aligned', async ({ page }) => {
  test.setTimeout(180_000)
  const { grid } = await openProducts(page)

  for (let step = 0; step < 40; step += 1) {
    await page.keyboard.press('ArrowDown')
    await expectActiveRowInView(grid, `down to top-edge test step ${step + 1}`)
  }
  for (let step = 0; step < 12; step += 1) {
    await page.keyboard.press('ArrowUp')
    await expectActiveRowInView(grid, `back up before top-edge test step ${step + 1}`)
  }

  let before = await moveUntilActiveRowAtTopEdge(grid, page)
  if (before.scrollTop === 0) {
    for (let step = 0; step < 18; step += 1) {
      await page.keyboard.press('ArrowDown')
      await expectActiveRowInView(grid, `re-open scroll room step ${step + 1}`)
    }
    for (let step = 0; step < 8; step += 1) {
      await page.keyboard.press('ArrowUp')
      await expectActiveRowInView(grid, `re-seat below top step ${step + 1}`)
    }
    before = await moveUntilActiveRowAtTopEdge(grid, page)
  }
  const rowHeight = before.rowBottom - before.rowTop
  const bodyHeight = before.viewportBottom - before.viewportTop
  const activeBefore = await grid.getAttribute('aria-activedescendant')
  expect(before.scrollTop, 'top-edge ArrowUp needs rows scrolled above the viewport').toBeGreaterThan(0)

  await page.keyboard.press('ArrowUp')
  await expectActiveRowInView(grid, 'ArrowUp past top edge')
  const after = await activeRowViewportState(grid)
  expect(after, 'active row after top-edge ArrowUp').not.toBeNull()
  const activeAfter = await grid.getAttribute('aria-activedescendant')
  expect(activeAfter, 'ArrowUp should move off the prior active row').not.toBe(activeBefore)

  const scrollDelta = before.scrollTop - after!.scrollTop
  expect(scrollDelta).toBeGreaterThan(0)
  expect(scrollDelta).toBeLessThanOrEqual(rowHeight + 6)
  expect(Math.abs(after!.rowTop - after!.viewportTop)).toBeLessThan(6)
  expect(after!.viewportBottom - after!.rowBottom).toBeGreaterThan(bodyHeight * 0.35)
})