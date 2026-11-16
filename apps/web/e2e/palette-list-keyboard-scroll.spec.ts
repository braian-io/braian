import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { focusMainTable, mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  const tab = page.locator('nav.tabs').getByRole('button', { name: /^Products/ })
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  await expect(mainTable(page)).toBeVisible()
}

async function openFieldsPalette(page: Page) {
  await focusMainTable(page)
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('Select fields')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('fields-mode')).toBeVisible()
}

type InView = {
  inView: boolean
  listTop: number
  listBottom: number
  activeTop: number
  activeBottom: number
}

async function activeRowInList(page: Page, listSelector: string): Promise<InView | null> {
  return page.evaluate((selector) => {
    const list = document.querySelector<HTMLElement>(selector)
    const active =
      list?.querySelector<HTMLElement>(
        '.hit.on, .fields-hit-active, [data-active="true"], [role="option"][aria-selected="true"]',
      ) ?? null
    if (!list || !active) return null
    const lr = list.getBoundingClientRect()
    const ar = active.getBoundingClientRect()
    return {
      inView: ar.top >= lr.top - 0.5 && ar.bottom <= lr.bottom + 0.5,
      listTop: lr.top,
      listBottom: lr.bottom,
      activeTop: ar.top,
      activeBottom: ar.bottom,
    }
  }, listSelector)
}

async function drillToProtein(page: Page) {
  for (let i = 0; i < 80; i += 1) {
    const activeId = await page
      .locator('[data-testid="fields-mode"] [data-active="true"]')
      .getAttribute('data-testid')
    if (activeId === 'fields-row-protein') {
      await page.keyboard.press('ArrowRight')
      await expect(page.getByTestId('fields-crumb')).toContainText('Protein')
      return
    }
    await page.keyboard.press('ArrowDown')
  }
  throw new Error('Could not reach Protein field row')
}

test.describe('palette keyboard scroll keeps the active row visible', () => {
  test.setTimeout(180_000)

  test('Fields list and drilled level scroll with ArrowDown', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    try {
      await openFieldsPalette(page)
      const listSelector = '[data-testid="fields-mode-list"]'

      for (let step = 0; step < 24; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(page, listSelector)
        expect(state, `step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `step ${step}: active row outside list viewport`).toBe(true)
      }

      await drillToProtein(page)
      const drillList = '[data-testid="fields-mode-list"]'
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(page, drillList)
        expect(state, `drill step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `drill step ${step}: active row outside list viewport`).toBe(true)
      }

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)
    } finally {
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  })
})