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
      const cell = document.querySelector<HTMLElement>('[data-agent-dock-cell="true"]')
        ?? document.querySelector(
          ".dock-root > .split.horizontal[data-agent-dock='true'] > .split-cell[data-agent-dock-cell]",
        )
        ?? document.querySelector(
          ".dock-root > .split.horizontal[data-agent-shell='true'] > .split-cell[data-agent-dock-cell]",
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
    const grid = root.querySelector('.grid')
    const scroller = (grid ?? root.querySelector('.table-wrap') ?? root.closest('.pane-body') ?? root) as HTMLElement
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

/** Scroll the real grid and tag the pane so a remount cannot pass as "still there". */
async function pinProductsPane(page: Page) {
  const pinned = await paneWithTab(page, 'Products').evaluate((root) => {
    const grid = root.querySelector('.grid') as HTMLElement | null
    const scroller = grid && grid.scrollHeight > grid.clientHeight + 8 ? grid : (root.querySelector('.pane-body') as HTMLElement | null)
    if (!scroller) return { scrollTop: 0, max: 0 }
    const max = scroller.scrollHeight - scroller.clientHeight
    scroller.scrollTop = Math.min(360, max)
    root.dataset.row281Pane = 'live'
    ;(root as HTMLElement & { __row281?: number }).__row281 = 281
    if (grid) (grid as HTMLElement & { __row281?: number }).__row281 = 281
    return { scrollTop: scroller.scrollTop, max }
  })
  expect(pinned.max, 'Products pane has somewhere to scroll').toBeGreaterThan(0)
  expect(pinned.scrollTop, 'Products scroll starts below the top').toBeGreaterThan(0)
  return pinned
}

async function assertProductsPaneIdentity(page: Page, when: string) {
  const alive = await paneWithTab(page, 'Products').evaluate((root) => {
    const grid = root.querySelector('.grid') as (HTMLElement & { __row281?: number }) | null
    const node = root as HTMLElement & { __row281?: number }
    return {
      pane: node.dataset.row281Pane === 'live' && node.__row281 === 281,
      grid: grid?.__row281 === 281,
      scrollTop: grid?.scrollTop ?? 0,
    }
  })
  expect(alive.pane, `Products pane node survives when the agent ${when}`).toBe(true)
  expect(alive.grid, `Products grid node survives when the agent ${when}`).toBe(true)
  expect(alive.scrollTop, `Products scroll stays below the top when the agent ${when}`).toBeGreaterThan(0)
}

async function assertProductsRow(
  page: Page,
  before: { rowId: string },
  when: string,
) {
  const table = mainTable(page, 'Products')
  const after = await productsScrollState(page, table)
  expect(after.rowId, `selected Products row survives when the agent ${when}`).toBe(before.rowId)
  expect(after.rowId.length, `Products row id must be set when the agent ${when}`).toBeGreaterThan(0)
}

async function paneWidth(page: Page, title: string) {
  const box = await paneWithTab(page, title).boundingBox()
  expect(box, `${title} pane has a layout box`).toBeTruthy()
  return box!.width
}

/** Open or close the dock and require a real width transition, unless reduced motion is on. */
async function toggleAgentDock(page: Page, mode: 'open' | 'close') {
  const reduced = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const before = await page.locator('[data-agent-dock-cell]').evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    duration: Number.parseFloat(getComputedStyle(el).transitionDuration) || 0,
  })).catch(() => ({ width: 0, duration: 0 }))
  await page.evaluate(() => {
    const host = window as Window & { __dock?: { duration: number; widths: number[] } }
    const cell = document.querySelector<HTMLElement>('[data-agent-dock-cell]')
    const bucket: { duration: number; widths: number[] } = (host.__dock = { duration: 0, widths: [] })
    if (!cell) return
    const started = performance.now()
    const sample = () => {
      bucket.duration = Math.max(bucket.duration, Number.parseFloat(getComputedStyle(cell).transitionDuration) || 0)
      bucket.widths.push(cell.getBoundingClientRect().width)
      if (performance.now() - started < 180) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  await page.keyboard.press('Control+j')
  if (mode === 'close') await expect(page.getByTestId('agent-view')).toHaveCount(0)
  else await expect(page.getByTestId('agent-view').last()).toBeVisible({ timeout: 30_000 })
  if (reduced) {
    await page.waitForTimeout(80)
    const duration = await page.locator('[data-agent-dock-cell]').evaluate((el) => (
      Number.parseFloat(getComputedStyle(el).transitionDuration) || 0
    ))
    expect(duration, 'reduced motion sets the dock transition duration to 0').toBe(0)
    const seen = await page.evaluate(() => (window as Window & { __dock?: { widths: number[] } }).__dock)
    const widths = seen?.widths ?? []
    const low = Math.min(...widths, before.width)
    const high = Math.max(...widths, before.width)
    const mid = widths.some((value) => value > low + 8 && value < high - 8)
    expect(mid, 'reduced motion does not pass through an intermediate dock width').toBe(false)
    return
  }
  expect(before.duration, `dock transition duration is set before it ${mode}s`).toBeGreaterThan(0)
  await page.waitForTimeout(200)
  const seen = await page.evaluate(() => (
    window as Window & { __dock?: { duration: number; widths: number[] } }
  ).__dock)
  expect(seen?.duration, `dock transition duration stays above 0 as it ${mode}s`).toBeGreaterThan(0)
  const widths = [before.width, ...(seen?.widths ?? [])]
  const low = Math.min(...widths)
  const high = Math.max(...widths)
  expect(high - low, `dock width moves when it ${mode}s`).toBeGreaterThan(24)
  const mid = widths.some((value) => value > low + 8 && value < high - 8)
  expect(
    mid,
    `dock ${mode} passes through an intermediate width (${widths.map((value) => Math.round(value)).join(',')})`,
  ).toBe(true)
}

async function exerciseReloadCloseAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await login(page)
  const products = mainTable(page, 'Products')
  const detailPane = page.locator('section.pane').filter({ has: page.getByTestId('object-detail') })
  const row = products.getByTestId('object-row').nth(8)
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(detailPane).toBeVisible()

  const anchorsBefore = await anchorBoxes(page)
  const productsClosed = await paneWidth(page, 'Products')
  const paneStateBeforeAgent = await productsScrollState(page, products)

  const prompt = `row281 reload pin ${width} ${Date.now().toString().slice(-5)}`
  try {
    await openAgentAsk(page, prompt)
    const agent = page.getByTestId('agent-view').last()
    await expect(agent).toBeVisible({ timeout: 30_000 })
    await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await waitForAgentDockReflow(page)
    const productsOpen = await paneWidth(page, 'Products')
    const detailOpen = (await detailPane.boundingBox()) as Box
    expect(detailOpen, `Detail has a box with the agent open at ${width}px`).toBeTruthy()
    const loss = (productsClosed - productsOpen) / productsClosed
    console.log(
      `row281@${width} productsClosed=${productsClosed.toFixed(1)} productsOpen=${productsOpen.toFixed(1)} detail=${detailOpen.width.toFixed(1)} loss=${(loss * 100).toFixed(1)}%`,
    )
    expect(detailOpen.width, `Detail stays at least 360px with the agent open at ${width}px`).toBeGreaterThanOrEqual(360)
    if (width <= 1359) {
      expect(
        loss,
        `Products loses ${(loss * 100).toFixed(1)}% at ${width}px (closed ${productsClosed.toFixed(0)}px, open ${productsOpen.toFixed(0)}px)`,
      ).toBeLessThanOrEqual(0.25)
    }
    const savePromise = waitForLayoutSave(page)
    await page.locator('.pane-tab[data-view-type="agent"].active').last().click().catch(() => undefined)
    await savePromise

    await page.reload()
    await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
    await expect(mainTable(page, 'Products').getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('agent-view').last()).toBeVisible({ timeout: 30_000 })
    await assertProductsRow(page, paneStateBeforeAgent, 'reloads with the dock open')
    const detailOpenAfterReload = (await detailPane.boundingBox()) as Box
    const productsAfterReload = await paneWidth(page, 'Products')
    expect(detailOpenAfterReload).toBeTruthy()
    const lossAfterReload = (productsClosed - productsAfterReload) / productsClosed
    console.log(
      `row281@${width} after reload productsOpen=${productsAfterReload.toFixed(1)} detail=${detailOpenAfterReload.width.toFixed(1)} loss=${(lossAfterReload * 100).toFixed(1)}%`,
    )
    expect(
      detailOpenAfterReload.width,
      `Detail keeps width with the agent open after reload at ${width}px`,
    ).toBeGreaterThanOrEqual(360)
    if (width <= 1359) {
      expect(lossAfterReload, `Products width after reload at ${width}px`).toBeLessThanOrEqual(0.25)
    }

    await pinProductsPane(page)
    await toggleAgentDock(page, 'close')
    await waitForAgentDockReflow(page)

    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), `closes after reload at ${width}px`)
    await assertProductsRow(page, paneStateBeforeAgent, 'closes after reload')
    await assertProductsPaneIdentity(page, 'closes after reload')

    await toggleAgentDock(page, 'open')
    await waitForAgentDockReflow(page)
    const detailOpenAgain = (await detailPane.boundingBox()) as Box
    expect(detailOpenAgain).toBeTruthy()
    expect(
      detailOpenAgain.width,
      `Detail keeps width when the agent reopens after reload at ${width}px`,
    ).toBeGreaterThanOrEqual(360)
    expectAnchorsStable(anchorsBefore, await anchorBoxes(page), `opens again at ${width}px after reload`)
    await assertProductsRow(page, paneStateBeforeAgent, 'opens again after reload')
    await assertProductsPaneIdentity(page, 'opens again after reload')

    if (width === 1280) {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await toggleAgentDock(page, 'close')
    }
  } finally {
    await page.emulateMedia({ reducedMotion: 'no-preference' }).catch(() => undefined)
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