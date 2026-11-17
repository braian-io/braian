import { expect, test, type Locator, type Page } from '@playwright/test'
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
  scrollTop: number
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
      scrollTop: list.scrollTop,
    }
  }, listSelector)
}

async function waitForStableOptions(palette: Locator, timeout = 60_000): Promise<void> {
  let stable: string[] = []
  await expect
    .poll(
      async () => {
        const values = await palette
          .getByRole('option')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-value') ?? ''))
        const settled = values.length > 1 && values.join('\u0000') === stable.join('\u0000')
        stable = values
        return settled
      },
      { message: 'palette option order', timeout, intervals: [100, 100, 150, 200, 250] },
    )
    .toBe(true)
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

  test('Fields list: filter, drill, back, and ArrowDown scroll', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    const listSelector = '[data-testid="fields-mode-list"]'
    try {
      await openFieldsPalette(page)

      for (let step = 0; step < 24; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(page, listSelector)
        expect(state, `step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `step ${step}: active row outside list viewport`).toBe(true)
      }

      await page.getByTestId('fields-mode-input').fill('protein')
      const filterState = await activeRowInList(page, listSelector)
      expect(filterState, 'filter should leave an active row').not.toBeNull()
      expect(filterState!.inView, 'filter highlight outside list viewport').toBe(true)

      await page.getByTestId('fields-mode-input').fill('')
      await drillToProtein(page)
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(page, listSelector)
        expect(state, `drill step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `drill step ${step}: active row outside list viewport`).toBe(true)
      }

      await page.keyboard.press('ArrowLeft')
      await expect(page.getByTestId('fields-crumb')).not.toContainText('Protein')
      await page.keyboard.press('ArrowDown')
      const afterBack = await activeRowInList(page, listSelector)
      expect(afterBack, 'after ← back, active row should exist').not.toBeNull()
      expect(afterBack!.inView, 'after ← back, highlight outside list viewport').toBe(true)

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)
    } finally {
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  })

  test('Root list: filter, Open structure › drill, back, and ArrowDown scroll', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

    const rootList = '#palette-list'
    try {
      await focusMainTable(page)
      await page.keyboard.press('Control+k')
      const palette = page.getByTestId('command-palette')
      await expect(palette).toBeVisible()
      await waitForStableOptions(palette)

      await expect(palette.locator('[data-value="layout:open-structure"]')).toBeVisible({ timeout: 60_000 })
      await page.getByTestId('palette-input').fill('open structure')
      await expect(palette.getByRole('option', { name: /^Open structure/ }).first()).toBeVisible()
      await expect
        .poll(async () => activeRowInList(page, rootList), { timeout: 60_000, intervals: [50, 100, 150, 200] })
        .toMatchObject({ inView: true })

      await page.keyboard.press('Tab')
      await expect(page.getByTestId('palette-crumb')).toContainText('Open structure ›')
      const drillState = await activeRowInList(page, rootList)
      expect(drillState, 'drill-in should highlight a row').not.toBeNull()
      expect(drillState!.inView, 'drill-in highlight outside list viewport').toBe(true)

      await page.keyboard.press('Backspace')
      await expect(page.getByTestId('palette-crumb')).toBeEmpty()
      await page.keyboard.press('ArrowDown')
      const afterBack = await activeRowInList(page, rootList)
      expect(afterBack, 'after back, active row should exist').not.toBeNull()
      expect(afterBack!.inView, 'after back, highlight outside list viewport').toBe(true)

      for (let step = 0; step < 18; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(page, rootList)
        expect(state, `root step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `root step ${step}: active row outside list viewport`).toBe(true)
      }

      for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 250)
      const afterWheel = await page.evaluate((selector) => {
        const list = document.querySelector<HTMLElement>(selector)
        return list?.scrollTop ?? 0
      }, rootList)
      expect(afterWheel).toBeGreaterThan(0)
      const foot = page.locator('.palette-foot').first()
      const footBox = await foot.boundingBox()
      expect(footBox).not.toBeNull()
      await page.mouse.move(footBox!.x + 12, footBox!.y + 8)
      const afterPointer = await page.evaluate((selector) => {
        const list = document.querySelector<HTMLElement>(selector)
        return list?.scrollTop ?? 0
      }, rootList)
      expect(afterPointer).toBe(afterWheel)
    } finally {
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  })
})