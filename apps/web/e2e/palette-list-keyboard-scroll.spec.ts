import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { focusMainTable, mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  const tableTab = page.locator('.pane-tab[data-view-type="object_table"]').first()
  await expect(tableTab).toBeVisible({ timeout: 60_000 })
  if ((await page.getByTestId('object-row').count()) === 0) await tableTab.click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
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

async function activeRowInList(list: Locator): Promise<InView | null> {
  if ((await list.count()) === 0) return null
  return list.evaluate((listEl) => {
    const active =
      listEl.querySelector<HTMLElement>(
        '.hit.on, .fields-hit-active, [data-active="true"], [role="option"][aria-selected="true"]',
      ) ?? null
    if (!active) return null
    const lr = listEl.getBoundingClientRect()
    const ar = active.getBoundingClientRect()
    return {
      inView: ar.top >= lr.top - 0.5 && ar.bottom <= lr.bottom + 0.5,
      listTop: lr.top,
      listBottom: lr.bottom,
      activeTop: ar.top,
      activeBottom: ar.bottom,
      scrollTop: listEl.scrollTop,
    }
  })
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

    const fieldsList = page.locator('[data-testid="fields-mode-list"]')
    try {
      await openFieldsPalette(page)

      for (let step = 0; step < 24; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(fieldsList)
        expect(state, `step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `step ${step}: active row outside list viewport`).toBe(true)
      }

      await page.getByTestId('fields-mode-input').fill('protein')
      const filterState = await activeRowInList(fieldsList)
      expect(filterState, 'filter should leave an active row').not.toBeNull()
      expect(filterState!.inView, 'filter highlight outside list viewport').toBe(true)

      await page.getByTestId('fields-mode-input').fill('')
      await drillToProtein(page)
      for (let step = 0; step < 12; step += 1) {
        await page.keyboard.press('ArrowDown')
        const state = await activeRowInList(fieldsList)
        expect(state, `drill step ${step}: active row should exist`).not.toBeNull()
        expect(state!.inView, `drill step ${step}: active row outside list viewport`).toBe(true)
      }

      await page.keyboard.press('ArrowLeft')
      await expect(page.getByTestId('fields-crumb')).not.toContainText('Protein')
      await page.keyboard.press('ArrowDown')
      const afterBack = await activeRowInList(fieldsList)
      expect(afterBack, 'after ← back, active row should exist').not.toBeNull()
      expect(afterBack!.inView, 'after ← back, highlight outside list viewport').toBe(true)

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)
    } finally {
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  })

  test('Root list: filter moves with arrows and Enter runs the highlight', async ({ page }) => {
    await login(page)
    await focusMainTable(page)
    await page.keyboard.press('Control+k')
    const palette = page.getByTestId('command-palette')
    await expect(palette).toBeVisible()
    await page.getByTestId('palette-input').fill('cheese')
    await expect(palette.locator('.hit').filter({ hasText: '·' }).first()).toBeVisible()
    const highlighted = palette.locator('#palette-list .hit.on')
    await expect(highlighted).toHaveCount(1)
    const first = await highlighted.getAttribute('data-value')
    expect(first).toBeTruthy()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(highlighted).not.toHaveAttribute('data-value', first!)
    const picked = await highlighted.getAttribute('data-value')
    expect(picked).toBeTruthy()
    expect(picked!.startsWith('hit:')).toBe(true)
    const openName = (await highlighted.locator('.hit-title').innerText()).split('·')[0]?.trim() ?? ''
    expect(openName.length).toBeGreaterThan(0)
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await page.locator('[data-view-type="object_detail"]').first().click()
    await expect(page.getByTestId('object-detail')).toContainText(openName)
  })

})