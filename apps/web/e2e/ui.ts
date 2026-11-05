import { expect, type Locator, type Page } from '@playwright/test'

/** The pane that holds the named object table, not a peer table with the same test ids. */
export function paneWithTab(page: Page, title: string): Locator {
  return page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: title }),
  })
}

/** Main object table in a type workspace. Products is the default type workspace. */
export function mainTable(page: Page, title = 'Products'): Locator {
  return paneWithTab(page, title).getByTestId('object-table').first()
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
    await peer
      .locator('.pane-tab[data-view-type="object_table"] .tab-x')
      .first()
      .click({ force: true })
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
