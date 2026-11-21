import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type RowInView = {
  inView: boolean
  viewportTop: number
  viewportBottom: number
  rowTop: number
  rowBottom: number
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