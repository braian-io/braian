import { mainTable, paneWithTab, setTheme } from './ui'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('braian.theme', JSON.stringify('dark'))
  })
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function headerBottom(page: Page) {
  const header = page.locator('header.app-bar')
  await expect(header).toBeVisible()
  const box = await header.boundingBox()
  expect(box, 'app header box').toBeTruthy()
  return box!.y + box!.height
}

async function expectFullSizeToolbarClear(page: Page, close: Locator, headerLimit: number) {
  const toolbar = close.locator('xpath=ancestor::div[contains(@class,"toolbar")][1]')
  await expect(toolbar).toBeVisible()
  const fit = page.getByTestId('graph-fit')
  const relayout = page.getByTestId('graph-relayout')
  await expect(fit).toBeVisible()
  await expect(relayout).toBeVisible()

  for (const control of [fit, relayout, close]) {
    const box = await control.boundingBox()
    expect(box, `${await control.getAttribute('data-testid') ?? 'control'} box`).toBeTruthy()
    expect(box!.y, 'toolbar control sits below the app header').toBeGreaterThanOrEqual(headerLimit - 0.5)
  }

  const legend = page.locator('.graph-full .graph-legend').first()
  await expect(legend).toBeVisible()
  const legendBox = await legend.boundingBox()
  expect(legendBox, 'legend box').toBeTruthy()
  const fullBox = await page.getByTestId('graph-full').boundingBox()
  expect(fullBox, 'full-size chrome box').toBeTruthy()
  expect(legendBox!.y + legendBox!.height, 'legend stays inside the full-size chrome').toBeLessThanOrEqual(
    fullBox!.y + fullBox!.height + 0.5,
  )
  expect(legendBox!.y, 'legend clears the app header').toBeGreaterThanOrEqual(headerLimit - 0.5)
}

async function exerciseFullSizeGraph(page: Page, open: () => Promise<void>) {
  const headerLimit = await headerBottom(page)
  let opened = false
  try {
    await open()
    opened = true
    await expect(page.getByTestId('graph-full')).toBeVisible()
    await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })

    const close = page.getByRole('button', { name: 'Close full size', exact: true })
    await expectFullSizeToolbarClear(page, close, headerLimit)

    await page.getByTestId('graph-fit').click()
    await page.getByTestId('graph-relayout').click()
    await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })

    await setTheme(page, 'light')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expectFullSizeToolbarClear(page, close, headerLimit)

    await page.locator('canvas[data-testid=graph]').focus()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('graph-full')).toHaveCount(0)
    opened = false
  } finally {
    if (opened) await page.getByRole('button', { name: 'Close full size', exact: true }).click({ timeout: 2_000 }).catch(() => {})
  }
}

async function openModelGraph(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const graphTab = page.locator('.pane-tab', { hasText: 'Model graph' }).first()
  await expect(graphTab).toBeVisible({ timeout: 60_000 })
  await graphTab.click()
  await expect(page.locator('canvas[data-testid=graph]')).toBeVisible()
}

async function openArticleGraph(page: Page) {
  const workspace = page.locator('nav.tabs').getByRole('button', { name: /^Articles/ })
  await workspace.click()
  await expect(workspace).toHaveClass(/active/)
  const table = paneWithTab(page, 'Articles')
  await expect(table.getByTestId('object-table')).toBeVisible({ timeout: 60_000 })
  const row = table.getByTestId('object-row').first()
  await expect(row).toBeVisible()
  await row.click()
  const graphTab = page.locator('.pane-tab[data-view-type="graph"]').first()
  await expect(graphTab).toBeVisible({ timeout: 60_000 })
  await graphTab.click()
  await expect(page.locator('canvas[data-testid=graph]')).toBeVisible()
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true', { timeout: 40_000 })
}

test('model graph full size keeps the toolbar below the app header', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await exerciseFullSizeGraph(page, async () => {
    await openModelGraph(page)
    await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  })
})

test('object graph full size keeps the toolbar below the app header', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await exerciseFullSizeGraph(page, async () => {
    await openArticleGraph(page)
    await page.getByRole('button', { name: 'Open full size', exact: true }).click()
  })
})