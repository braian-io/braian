// Row 281 (K2): reload with the agent dock open, close with Ctrl+J — Products must not jump.
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { closeAllAgentTabs, mainTable } from './ui'

type Box = { x: number; y: number; width: number; height: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const productsTab = page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first()
  if (await productsTab.count()) await productsTab.click()
  await expect(mainTable(page, 'Products').getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function openAgentAsk(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
}

async function waitForLayoutSave(page: Page) {
  await page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith('/state')
      && response.ok(),
    { timeout: 30_000 },
  )
}

async function waitForAgentDockReflow(page: Page) {
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        resolve()
        return
      }
      const cell = document.querySelector(
        ".dock-root > .split.horizontal[data-agent-dock='true'] > .split-cell",
      ) ?? document.querySelector('.dock-root > .split.horizontal > .split-cell')
      if (!cell) {
        resolve()
        return
      }
      let done = false
      const finish = () => {
        if (done) return
        done = true
        cell.removeEventListener('transitionend', onEnd)
        resolve()
      }
      const onEnd = (event: Event) => {
        if (!(event instanceof TransitionEvent)) return
        if (
          event.target === cell
          && (event.propertyName === 'width' || event.propertyName === 'flex-basis')
        ) {
          finish()
        }
      }
      cell.addEventListener('transitionend', onEnd)
      window.setTimeout(finish, 220)
    })
  })
}

async function cleanupDrafts(page: Page) {
  await page.getByTestId('discard-draft').first().click({ timeout: 5_000 }).catch(() => undefined)
  const discardAll = page.getByRole('button', { name: 'Discard all' })
  if ((await discardAll.count()) > 0 && (await discardAll.isEnabled())) {
    await discardAll.click({ timeout: 15_000 }).catch(() => undefined)
  }
  await closeAllAgentTabs(page)
}

async function productsLeftEdge(page: Page) {
  const table = mainTable(page, 'Products')
  const box = await table.boundingBox()
  expect(box, 'Products table needs a layout box').toBeTruthy()
  return (box as Box).x
}

async function exerciseReloadCloseAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await login(page)
  const products = mainTable(page, 'Products')
  const anchorBeforeAgent = await productsLeftEdge(page)

  const prompt = `row281 reload pin ${width} ${Date.now().toString().slice(-5)}`
  try {
    await openAgentAsk(page, prompt)
    const agent = page.getByTestId('agent-view').last()
    await expect(agent).toBeVisible({ timeout: 30_000 })
    await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await waitForAgentDockReflow(page)
    const savePromise = waitForLayoutSave(page)
    await page.locator('.pane-tab[data-view-type="agent"].active').last().click().catch(() => undefined)
    await savePromise

    await page.reload()
    await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
    await expect(products.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('agent-view').last()).toBeVisible({ timeout: 30_000 })

    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view')).toHaveCount(0)
    await waitForAgentDockReflow(page)

    const afterClose = await productsLeftEdge(page)
    expect(
      Math.abs(afterClose - anchorBeforeAgent),
      `Products left edge stays within 8px after reload close at ${width}px`,
    ).toBeLessThan(8)
  } finally {
    await cleanupDrafts(page)
  }
}

for (const { width, height } of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
] as const) {
  test(`reload with agent open keeps Products pinned at ${width}px (row 281)`, async ({ page }) => {
    test.setTimeout(180_000)
    await exerciseReloadCloseAt(page, width, height)
  })
}