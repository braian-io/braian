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
  activeValue: string | null
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
      activeValue: active.getAttribute('data-value'),
    }
  })
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

async function expectActiveInView(list: Locator, label: string): Promise<InView> {
  let state: InView | null = null
  await expect
    .poll(
      async () => {
        state = await activeRowInList(list)
        return state?.inView ?? false
      },
      { message: `${label}: active row in list viewport`, timeout: 15_000, intervals: [50, 80, 120, 200] },
    )
    .toBe(true)
  expect(state, `${label}: active row should exist`).not.toBeNull()
  return state!
}

async function pressArrowDownAndAssertInView(list: Locator, page: Page, step: number, scope: string): Promise<void> {
  await page.keyboard.press('ArrowDown')
  await expectActiveInView(list, `${scope} step ${step}`)
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

  test('Fields list: filter, drill, back, ArrowDown scroll, and wheel', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    const fieldsList = page.locator('[data-testid="fields-mode-list"]')
    try {
      await openFieldsPalette(page)

      for (let step = 0; step < 24; step += 1) {
        await pressArrowDownAndAssertInView(fieldsList, page, step, 'fields root')
      }

      await page.getByTestId('fields-mode-input').fill('protein')
      await expectActiveInView(fieldsList, 'fields filter highlight')

      await page.getByTestId('fields-mode-input').fill('')
      await drillToProtein(page)
      for (let step = 0; step < 12; step += 1) {
        await pressArrowDownAndAssertInView(fieldsList, page, step, 'fields drill')
      }

      await page.keyboard.press('ArrowLeft')
      await expect(page.getByTestId('fields-crumb')).not.toContainText('Protein')
      await page.keyboard.press('ArrowDown')
      await expectActiveInView(fieldsList, 'fields after ← back')

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)

      await openFieldsPalette(page)
      const scrollAfterOpen = (await activeRowInList(fieldsList))?.scrollTop ?? 0
      const activeBeforeWheel = (await activeRowInList(fieldsList))?.activeValue
      for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 200)
      const afterWheel = await activeRowInList(fieldsList)
      expect(afterWheel?.scrollTop ?? 0).toBeGreaterThan(scrollAfterOpen)
      const wheelTop = afterWheel?.scrollTop ?? 0
      expect(afterWheel?.activeValue).toBe(activeBeforeWheel)

      const foot = page.getByTestId('fields-mode-foot')
      const footBox = await foot.boundingBox()
      expect(footBox).not.toBeNull()
      await page.mouse.move(footBox!.x + 12, footBox!.y + 8)
      const afterHover = await activeRowInList(fieldsList)
      expect(afterHover?.scrollTop).toBe(wheelTop)
      expect(afterHover?.activeValue).toBe(activeBeforeWheel)

      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)
    } finally {
      await page.keyboard.press('Escape').catch(() => undefined)
      await page.keyboard.press('Escape').catch(() => undefined)
    }
  })

  test('Root list: Open structure › drill, Backspace, ArrowDown scroll, and wheel', async ({ page }) => {
    await login(page)

    try {
      await focusMainTable(page)
      await page.keyboard.press('Control+k')
      const palette = page.getByTestId('command-palette')
      const rootList = palette.locator('#palette-list')
      await expect(palette).toBeVisible()
      await waitForStableOptions(palette)
      await expectActiveInView(rootList, 'root list initial highlight')

      for (let step = 0; step < 18; step += 1) {
        await pressArrowDownAndAssertInView(rootList, page, step, 'root from top')
      }

      await page.keyboard.press('Escape')
      await expect(palette).toHaveCount(0)
      await focusMainTable(page)
      await page.keyboard.press('Control+k')
      await expect(palette).toBeVisible()
      await waitForStableOptions(palette)

      await page.getByTestId('palette-input').fill('open structure')
      await expect(palette.locator('.hit.on')).toContainText('Open structure')
      await page.keyboard.press('Tab')
      await expect(page.getByTestId('palette-crumb')).toContainText('Open structure ›')
      await expectActiveInView(rootList, 'root drill-in highlight')

      await page.keyboard.press('Backspace')
      await expect(page.getByTestId('palette-crumb')).toBeEmpty()
      await page.keyboard.press('ArrowDown')
      await expectActiveInView(rootList, 'root after Backspace')

      const scrollAfterKeys = (await activeRowInList(rootList))?.scrollTop ?? 0
      const activeBeforeWheel = (await activeRowInList(rootList))?.activeValue
      for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 250)
      const afterWheel = await activeRowInList(rootList)
      expect(afterWheel?.scrollTop ?? 0).toBeGreaterThan(scrollAfterKeys)
      const wheelTop = afterWheel?.scrollTop ?? 0
      expect(afterWheel?.activeValue).toBe(activeBeforeWheel)

      const foot = page.getByTestId('palette-foot')
      const footBox = await foot.boundingBox()
      expect(footBox).not.toBeNull()
      await page.mouse.move(footBox!.x + 12, footBox!.y + 8)
      const afterPointer = await activeRowInList(rootList)
      expect(afterPointer?.scrollTop).toBe(wheelTop)
      expect(afterPointer?.activeValue).toBe(activeBeforeWheel)
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
    await waitForStableOptions(palette)
    await page.getByTestId('palette-input').fill('cheese')
    await expect(palette.locator('.hit').filter({ hasText: '·' }).first()).toBeVisible()
    const highlighted = palette.locator('.hit.on')
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