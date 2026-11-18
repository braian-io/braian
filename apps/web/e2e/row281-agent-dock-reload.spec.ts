// Row 281: tree/catalog pin must survive reload with the agent dock already open.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { closeAllAgentTabs, mainTable, paneWithTab } from './ui'

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
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith('/state')
      && response.ok(),
    { timeout: 30_000 },
  )
  await saved
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

function structureTreePane(page: Page) {
  return page.locator('section.pane').filter({
    has: page.locator(".pane-tab[data-view-type='structure_tree']"),
  }).first()
}

async function anchorBoxes(page: Page) {
  const [table, tree] = await Promise.all([
    mainTable(page, 'Products').boundingBox(),
    structureTreePane(page).boundingBox(),
  ])
  expect(table && tree, 'products table and structure tree need layout boxes').toBeTruthy()
  return { table: table as Box, tree: tree as Box }
}

function expectAnchorsStable(
  before: { table: Box; tree: Box },
  after: { table: Box; tree: Box },
  when: string,
) {
  expect(
    Math.abs(after.table.x - before.table.x),
    `Products table left edge stays in place when the agent ${when}`,
  ).toBeLessThan(8)
  expect(
    Math.abs(after.tree.width - before.tree.width),
    `structure tree width stays fixed when the agent ${when}`,
  ).toBeLessThan(8)
}

async function productsScrollState(page: Page, table: Locator) {
  return table.evaluate((root) => {
    const scroller =
      root.querySelector('.table-wrap')
      ?? root.closest('.pane-body')
      ?? root
    const selected = root.querySelector('[data-testid="object-row"][aria-selected="true"]')
      ?? root.querySelector('[data-testid="object-row"].selected')
      ?? root.querySelector('[data-testid="object-row"].active')
    const focused = root.querySelector('[data-testid="object-row"]:focus-within')
    const row = (selected ?? focused) as HTMLElement | null
    return {
      scrollTop: scroller.scrollTop,
      rowId: row?.id ?? '',
    }
  })
}

async function assertProductsPaneState(
  page: Page,
  before: { scrollTop: number; rowId: string },
  when: string,
) {
  const table = mainTable(page, 'Products')
  const after = await productsScrollState(page, table)
  expect(after.rowId, `selected Products row survives when the agent ${when}`).toBe(before.rowId)
  expect(after.rowId.length, `Products row id must be set when the agent ${when}`).toBeGreaterThan(0)
  expect(Math.abs(after.scrollTop - before.scrollTop), `Products scroll survives when the agent ${when}`).toBeLessThan(8)
}

async function exerciseReloadCloseAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await login(page)
  const products = mainTable(page, 'Products')
  const productsPane = paneWithTab(page, 'Products')
  const detailPane = page.locator('section.pane').filter({ has: page.getByTestId('object-detail') })
  const row = products.getByTestId('object-row').nth(8)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(detailPane).toBeVisible()

  const anchorsBefore = await anchorBoxes(page)
  const paneStateBeforeAgent = await productsScrollState(page, products)

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
    await expect(mainTable(page, 'Products').getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('agent-view').last()).toBeVisible({ timeout: 30_000 })
    await assertProductsPaneState(page, paneStateBeforeAgent, 'reloads with the dock open')
    const detailOpenAfterReload = (await detailPane.boundingBox()) as Box
    expect(detailOpenAfterReload).toBeTruthy()
    const detailMinOpen = width >= 1360 ? 360 : 220
    expect(
      detailOpenAfterReload.width,
      `Detail keeps width with the agent open after reload at ${width}px`,
    ).toBeGreaterThanOrEqual(detailMinOpen)

    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view')).toHaveCount(0)
    await waitForAgentDockReflow(page)

    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), `closes after reload at ${width}px`)
    await assertProductsPaneState(page, paneStateBeforeAgent, 'closes after reload')

    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view').last()).toBeVisible({ timeout: 30_000 })
    await waitForAgentDockReflow(page)
    const detailOpenAgain = (await detailPane.boundingBox()) as Box
    expect(detailOpenAgain).toBeTruthy()
    expect(
      detailOpenAgain.width,
      `Detail keeps width when the agent reopens after reload at ${width}px`,
    ).toBeGreaterThanOrEqual(detailMinOpen)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), `opens again at ${width}px after reload`)
    await assertProductsPaneState(page, paneStateBeforeAgent, 'opens again after reload')
  } finally {
    await cleanupDrafts(page)
  }
}

for (const { width, height } of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const) {
  test(`reload with agent open keeps Products pinned at ${width}px (K1–K3)`, async ({ page }) => {
    test.setTimeout(180_000)
    await exerciseReloadCloseAt(page, width, height)
  })
}