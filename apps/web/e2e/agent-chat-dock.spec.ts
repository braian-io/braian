// Docked agent chat: right pane, no overlap with Detail, Products stays open.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

type Box = { x: number; y: number; width: number; height: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const products = page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first()
  if (await products.count()) await products.click()
  await expect(mainTable(page, 'Products').getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function openAgentAsk(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
}

function agentPane(page: Page) {
  return page.getByTestId('agent-view').last()
}

// Ctrl+J closes the dock only while the agent pane is the focused view.
// A result link focuses Products, so the shortcut would refocus the agent
// instead of closing it. Click the agent title (not a field) first.
async function closeAgentDock(page: Page) {
  const agent = agentPane(page)
  await agent.locator('.agent-view-head h2').click()
  await page.keyboard.press('Control+j')
  await expect(agent).toHaveCount(0)
}

function paneWithTable(page: Page) {
  return paneWithTab(page, 'Products')
}

function paneWithDetail(page: Page) {
  return page.locator('section.pane').filter({ has: page.getByTestId('object-detail') })
}

function paneWithAgent(page: Page) {
  return page.locator('section.pane').filter({ has: page.getByTestId('agent-view') }).last()
}

function intersectionWidth(a: Box, b: Box): number {
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.x + a.width, b.x + b.width)
  return Math.max(0, right - left)
}

function intersectionHeight(a: Box, b: Box): number {
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return Math.max(0, bottom - top)
}

function boxesOverlap(a: Box, b: Box): boolean {
  return intersectionWidth(a, b) > 0 && intersectionHeight(a, b) > 0
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
      )
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
  await page.keyboard.press('Control+j').catch(() => undefined)
  await page.keyboard.press('Control+j').catch(() => undefined)
}

async function expectNoAgentDetailOverlap(page: Page, detailMinWidth: number) {
  const [detailBox, agentBox] = await Promise.all([
    paneWithDetail(page).boundingBox(),
    paneWithAgent(page).boundingBox(),
  ])
  expect(detailBox && agentBox, 'detail and agent panes need layout boxes').toBeTruthy()
  expect(intersectionWidth(detailBox as Box, agentBox as Box), 'agent must not overlap Detail horizontally').toBe(0)
  expect(boxesOverlap(detailBox as Box, agentBox as Box), 'agent must not overlap Detail').toBe(false)
  expect((detailBox as Box).width, 'Detail keeps a usable width beside the agent').toBeGreaterThanOrEqual(detailMinWidth)
  expect((agentBox as Box).x).toBeGreaterThanOrEqual((detailBox as Box).x + (detailBox as Box).width - 2)
}

async function expectHitTarget(scope: Locator, testId: string) {
  const control = scope.getByTestId(testId).first()
  await expect(control).toBeVisible()
  const hit = await control.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const top = document.elementFromPoint(x, y)
    return top === node || (top != null && node.contains(top))
  })
  expect(hit, `${testId} must receive pointer hits`).toBe(true)
}

function expectProductsXStable(before: Box, after: Box) {
  expect(Math.abs(after.x - before.x), 'Products left edge stays in place when the agent toggles').toBeLessThan(8)
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

test('Ctrl+J opens a right agent chat while Products stays visible', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  const products = mainTable(page, 'Products')
  await expect(products).toBeVisible()
  const row = products.getByTestId('object-row').first()
  await row.click()
  const firstTarget = `cola 440 ${Date.now().toString().slice(-4)}`
  const prompt = `byt namn på den här produkten till ${firstTarget}`
  const productsPane = paneWithTable(page)
  const detailPane = paneWithDetail(page)
  await expect(detailPane).toBeVisible()
  await page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first().click()

  const layoutBefore = await Promise.all([productsPane.boundingBox(), detailPane.boundingBox()])
  expect(layoutBefore[0] && layoutBefore[1], 'products and detail panes need layout boxes').toBeTruthy()
  const [productsBefore, detailBefore] = layoutBefore as [Box, Box]
  const anchorsBefore = await anchorBoxes(page)
  const stacked = Math.abs(productsBefore.x - detailBefore.x) < 8
  if (stacked) expect(productsBefore.y).toBeLessThanOrEqual(detailBefore.y + 2)
  else expect(productsBefore.x).toBeLessThan(detailBefore.x + 4)

  await openAgentAsk(page, prompt)
  const agent = agentPane(page)
  await expect(agent).toBeVisible({ timeout: 30_000 })
  await expect(products).toBeVisible()
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await waitForAgentDockReflow(page)

  await expectNoAgentDetailOverlap(page, 360)

  const [productsAfter, detailAfter] = await Promise.all([
    productsPane.boundingBox(),
    detailPane.boundingBox(),
  ])
  expect(productsAfter && detailAfter, 'products and detail panes need layout boxes after agent opens').toBeTruthy()
  if (stacked) expect(productsAfter!.y).toBeLessThanOrEqual(detailAfter!.y + 2)
  else expect(productsAfter!.x).toBeLessThan(detailAfter!.x + 4)
  expectProductsXStable(productsBefore, productsAfter!)
  expectAnchorsStable(anchorsBefore, await anchorBoxes(page), 'opens')
  expect(productsAfter!.width, 'Products narrows when the agent takes a dock column').toBeLessThan(productsBefore.width - 8)

  await expect(agent.getByTestId('agent-follow-up')).toBeFocused()
  await expect(agent.getByTestId('agent-chat-user')).toContainText(prompt)
  await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(agent.getByTestId('agent-answer').first()).toContainText(/Waiting for Save|proposed/i)

  const objectId = ((await row.getAttribute('id')) ?? '').replace('object-row-', '')
  try {
    const result = agent.getByTestId('agent-result-link').first()
    await expect(result).toBeVisible()
    await result.click({ timeout: 15_000 })
    await expect(products.locator(`[id="object-row-${objectId}"] [data-column="name"]`)).toContainText(firstTarget, { timeout: 30_000 })
    await expectHitTarget(detailPane, 'review-and-save')
    await expectHitTarget(detailPane, 'discard-draft')

    const secondTarget = `cola 330 ${Date.now().toString().slice(-4)}`
    await agent.getByTestId('agent-follow-up').fill(`byt namn till ${secondTarget}`, { timeout: 15_000 })
    await agent.getByTestId('agent-send').click({ timeout: 15_000 })
    await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await expect(agent.getByTestId('agent-chat-user').filter({ hasText: secondTarget })).toBeVisible()
    await expect(agent.getByTestId('agent-send')).toBeDisabled()
    await closeAgentDock(page)
    await expect(products).toBeVisible()
    await waitForAgentDockReflow(page)
    const [productsClosed, detailClosed] = await Promise.all([
      productsPane.boundingBox(),
      detailPane.boundingBox(),
    ])
    expect(productsClosed && detailClosed).toBeTruthy()
    expectProductsXStable(productsBefore, productsClosed as Box)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), 'closes')
    expect(Math.abs((detailClosed as Box).x - detailBefore.x)).toBeLessThan(8)
    expect(Math.abs((detailClosed as Box).width - detailBefore.width)).toBeLessThan(8)

    await page.keyboard.press('Control+j')
    await expect(agentPane(page)).toBeVisible()
    await expect(agentPane(page).getByTestId('agent-chat-user').filter({ hasText: prompt })).toBeVisible()
    await expectNoAgentDetailOverlap(page, 360)
  } finally {
    await cleanupDrafts(page)
  }
})

test('agent dock does not cover Detail controls at 1280×800 (K2)', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const products = mainTable(page, 'Products')
  const productsPane = paneWithTable(page)
  const detailPane = paneWithDetail(page)
  await products.getByTestId('object-row').first().click()
  const productsBefore = (await productsPane.boundingBox()) as Box
  const anchorsBefore = await anchorBoxes(page)
  const prompt = `byt namn på den här produkten till slim ${Date.now().toString().slice(-4)}`
  try {
    await openAgentAsk(page, prompt)
    await expect(agentPane(page)).toBeVisible({ timeout: 30_000 })
    await expect(agentPane(page).getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await waitForAgentDockReflow(page)
    await expectNoAgentDetailOverlap(page, 220)
    const productsOpen = (await productsPane.boundingBox()) as Box
    expectProductsXStable(productsBefore, productsOpen)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), 'opens')
    const result = agentPane(page).getByTestId('agent-result-link').first()
    await expect(result).toBeVisible()
    await result.click({ timeout: 15_000 })
    await expectHitTarget(detailPane, 'review-and-save')
    await expectHitTarget(detailPane, 'discard-draft')
    await closeAgentDock(page)
    await waitForAgentDockReflow(page)
    const productsClosed = (await productsPane.boundingBox()) as Box
    expectProductsXStable(productsBefore, productsClosed)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), 'closes')
  } finally {
    await cleanupDrafts(page)
  }
})

test('agent dock keeps Products and the tree fixed at 1920×1080', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await login(page)
  const products = mainTable(page, 'Products')
  const productsPane = paneWithTable(page)
  const detailPane = paneWithDetail(page)
  await products.getByTestId('object-row').first().click()
  const productsBefore = (await productsPane.boundingBox()) as Box
  const anchorsBefore = await anchorBoxes(page)
  const prompt = `byt namn på den här produkten till wide ${Date.now().toString().slice(-4)}`
  try {
    await openAgentAsk(page, prompt)
    await expect(agentPane(page)).toBeVisible({ timeout: 30_000 })
    await expect(agentPane(page).getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await waitForAgentDockReflow(page)
    await expectNoAgentDetailOverlap(page, 360)
    const productsOpen = (await productsPane.boundingBox()) as Box
    expectProductsXStable(productsBefore, productsOpen)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), 'opens')
    const result = agentPane(page).getByTestId('agent-result-link').first()
    await expect(result).toBeVisible()
    await result.click({ timeout: 15_000 })
    await expectHitTarget(detailPane, 'review-and-save')
    await expectHitTarget(detailPane, 'discard-draft')
    await closeAgentDock(page)
    await waitForAgentDockReflow(page)
    const productsClosed = (await productsPane.boundingBox()) as Box
    expectProductsXStable(productsBefore, productsClosed)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), 'closes')
  } finally {
    await cleanupDrafts(page)
  }
})