import { expect, type Locator, type Page } from '@playwright/test'

/** The pane that holds the named object table, not a peer table with the same test ids. */
export function paneWithTab(page: Page, title: string): Locator {
  return page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: title }),
  }).first()
}

/** Main object table in a type workspace. Products is the default type workspace. */
export function mainTable(page: Page, title = 'Products'): Locator {
  return paneWithTab(page, title).getByTestId('object-table').first()
}

export function agentPaneTab(page: Page, sessionTitle?: string, which: 'first' | 'last' = 'last') {
  let tabs = page.locator('.pane-tab[data-view-type="agent"]')
  if (sessionTitle) {
    const escaped = sessionTitle.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    tabs = page.locator(`.pane-tab[data-view-type="agent"][title*="${escaped}"]`)
  } else {
    tabs = tabs.filter({ hasText: /^Agent$/ })
  }
  return which === 'first' ? tabs.first() : tabs.last()
}

export function agentSessionView(page: Page, sessionTitle: string) {
  return page.getByTestId('agent-view').filter({
    has: page.getByTestId('agent-session-title').filter({ hasText: sessionTitle }),
  }).last()
}

/** Close every open agent pane tab so layout reset can paint the catalog again. */
export async function closeAllAgentTabs(page: Page) {
  for (let guard = 0; guard < 16; guard += 1) {
    const tabs = page.locator('.pane-tab[data-view-type="agent"]')
    const count = await tabs.count()
    if (count === 0) return
    const tab = tabs.first()
    await tab.hover({ timeout: 3_000 }).catch(() => undefined)
    await tab.getByRole('button', { name: 'Close tab' }).click({ timeout: 3_000 }).catch(() => undefined)
    if ((await tabs.count()) >= count) {
      await page.keyboard.press('Control+j').catch(() => undefined)
    }
  }
}

export async function resetProductsLayout(page: Page, title = 'Products') {
  await closeAllAgentTabs(page).catch(() => undefined)
  await page.getByTestId('discard-draft').first().click({ timeout: 2_000 }).catch(() => undefined)
  await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
  const listed = await page.request.get('/v1/workspaces')
  const body = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
  const workspace = body.workspaces.find((item) => item.name === title)
  const me = await page.request.get('/v1/me')
  const userId = ((await me.json()) as { user_id?: string }).user_id
  if (userId && workspace) {
    await page.evaluate((key) => localStorage.removeItem(key), `braian.layout.${userId}.default.${workspace.id}`)
    await page.request.delete(`/v1/workspaces/${workspace.id}/state?environment=default`)
  }
  await page.reload()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
  await showProductsInner(page, title)
}

async function showProductsInner(page: Page, title = 'Products') {
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${title}`) }).click()
  const rows = mainTable(page, title).getByTestId('object-row')
  if (await rows.first().isVisible().catch(() => false)) return
  const pane = paneWithTab(page, title)
  const tab = pane.locator('.pane-tab[data-view-type="object_table"]', { hasText: title }).first()
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await expect(rows.first()).toBeVisible({ timeout: 60_000 })
}

/** Focus the Products table in the pane that owns the main object table. */
export async function showProducts(page: Page, title = 'Products') {
  await showProductsInner(page, title)
}

/** Draft links live in chat; review and save stay on the object table pane. */
export async function openAgentDraftInTable(page: Page, view: Locator, title = 'Products') {
  await view.getByTestId('agent-result-link').first().click({ timeout: 15_000 })
  await showProducts(page, title)
}

/**
 * Focus the main table before opening the Fields palette. The palette's fields
 * host is the last mounted object table, so a peer table would win; close the
 * peer and click the main row again before opening Fields.
 */
export async function focusMainTable(page: Page, title = 'Products'): Promise<Locator> {
  const table = mainTable(page, title)
  await expect(table).toBeVisible()
  const rows = table.getByTestId('object-row')
  await expect(rows.first()).toBeVisible()
  await rows.first().click()
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')

  // The Fields host is global and the last mounted object table wins. Close any
  // peer table before opening the palette, then click the selected main row
  // again so the main table publishes the host after the peer is gone.
  const objects = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]'),
  })
  const peer = objects
    .filter({ hasNot: page.locator('.pane-tab', { hasText: title }) })
    .first()
  if ((await peer.count()) > 0) {
    const peerTable = peer.getByTestId('object-table').first()
    const peerTab = peer.locator('.pane-tab[data-view-type="object_table"]').first()
    await peerTab.hover()
    await peerTab.getByRole('button', { name: 'Close tab' }).click()
    await expect(peerTable).toHaveCount(0)
  }
  await rows.first().click()
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true')
  return table
}

/** Switch the theme through the user menu and wait until `<html data-theme>` follows. */
export async function setTheme(page: Page, theme: 'light' | 'dark') {
  const html = page.locator('html')
  if ((await html.getAttribute('data-theme')) !== theme) {
    await page.getByTestId('user-menu').click()
    await page.getByTestId('user-menu-theme').click()
  }
  await expect(html).toHaveAttribute('data-theme', theme)
}

function boxesOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1 && a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1
}

/** A notice may cover the detail pane. It must not cover a product or article list. */
export async function expectToastClearsLists(page: Page, toast: Locator) {
  const toastBox = await toast.boundingBox()
  expect(toastBox).toBeTruthy()
  const lists = page.locator('section.pane').filter({ has: page.locator('[data-view-type="object_table"]') })
  const count = await lists.count()
  for (let index = 0; index < count; index += 1) {
    const box = await lists.nth(index).boundingBox()
    if (!box || !toastBox) continue
    expect(boxesOverlap(toastBox, box), 'toast overlaps a list pane').toBe(false)
  }
  const detail = await page.locator('section.pane').filter({ has: page.locator('[data-view-type="object_detail"]') }).first().boundingBox()
  if (!detail || !toastBox) return
  expect(toastBox.x + 4).toBeGreaterThanOrEqual(detail.x)
  expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(detail.x + detail.width + 4)
}
