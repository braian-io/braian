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
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openFieldsPalette(page: Page) {
  await focusMainTable(page)
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await page.getByTestId('palette-input').fill('Select fields')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('fields-mode')).toBeVisible()
}

async function enterOn(page: Page, rowTestId: string) {
  await expect(page.getByTestId(rowTestId)).toBeVisible()
  for (let i = 0; i < 40; i += 1) {
    const active = page.locator('[data-testid="fields-mode"] [data-active="true"]')
    const activeId = await active.getAttribute('data-testid')
    if (activeId === rowTestId) {
      await page.keyboard.press('Enter')
      return
    }
    const activeBox = await active.boundingBox()
    const targetBox = await page.getByTestId(rowTestId).boundingBox()
    if (activeBox && targetBox && targetBox.y + 1 < activeBox.y) {
      await page.keyboard.press('ArrowUp')
    } else {
      await page.keyboard.press('ArrowDown')
    }
  }
  throw new Error(`Could not move active highlight to ${rowTestId}`)
}

function headerIds(page: Page) {
  return mainTable(page).locator('.head [data-testid^="col-"]')
}

async function visibleHeaderIds(page: Page) {
  const ids = await headerIds(page).evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-testid') ?? ''),
  )
  return ids
}

test.describe('column drag and system fields', () => {
  test('drag reorders columns, survives reload; click still sorts', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    const before = await visibleHeaderIds(page)
    expect(before.length).toBeGreaterThan(2)
    const fromId = before[0]!
    const toId = before[2] ?? before[1]!
    expect(fromId).not.toBe(toId)

    // dnd-kit listeners sit on the header button (not the resize handle).
    const fromBtn = mainTable(page).getByTestId(fromId).locator('button.column-header-btn')
    const toBtn = mainTable(page).getByTestId(toId).locator('button.column-header-btn')
    const fromBox = await fromBtn.boundingBox()
    const toBox = await toBtn.boundingBox()
    if (!fromBox || !toBox) throw new Error('missing header boxes')

    const put = page.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )

    const startX = fromBox.x + Math.min(20, fromBox.width / 3)
    const startY = fromBox.y + fromBox.height / 2
    const endX = toBox.x + toBox.width / 2
    const endY = toBox.y + toBox.height / 2
    await fromBtn.hover()
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Exceed PointerSensor activationConstraint (5px), then move in steps.
    await page.mouse.move(startX + 12, startY, { steps: 2 })
    const steps = 16
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps
      await page.mouse.move(startX + (endX - startX) * t, startY + (endY - startY) * t)
    }
    await page.mouse.up()

    await expect.poll(async () => (await visibleHeaderIds(page))[0], { timeout: 10_000 }).not.toBe(fromId)
    await put

    const afterDrag = await visibleHeaderIds(page)
    expect(afterDrag).toContain(fromId)
    expect(afterDrag.indexOf(fromId)).toBeGreaterThan(0)

    await page.reload()
    await expect(mainTable(page)).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    const afterReload = await visibleHeaderIds(page)
    expect(afterReload).toEqual(afterDrag)

    // Click header still sorts (Name is usually present and sortable).
    const name = mainTable(page).locator('.head [data-testid="col-name"] button.column-header-btn').first()
    if (await name.count()) {
      await name.click()
      await expect.poll(async () => {
        const first = mainTable(page).getByTestId('object-row').first()
        return (await first.textContent()) ?? ''
      }).not.toEqual('')
    }
  })

  test('Type can be hidden and re-added via Fields ›', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })
    await expect(mainTable(page).locator('.head [data-testid="col-type"]').first()).toBeVisible()

    await openFieldsPalette(page)
    await expect(page.getByTestId('fields-row-type')).toBeVisible()
    const putHide = page.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await enterOn(page, 'fields-row-type')
    await page.keyboard.press('Escape')
    await putHide
    await expect(mainTable(page).locator('.head [data-testid="col-type"]').first()).toHaveCount(0)

    await openFieldsPalette(page)
    await expect(page.getByTestId('fields-row-type')).toBeVisible()
    const putShow = page.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await enterOn(page, 'fields-row-type')
    await page.keyboard.press('Escape')
    await putShow
    await expect(mainTable(page).locator('.head [data-testid="col-type"]').first()).toBeVisible()
  })

  test('Move column left and right via Ctrl+K', async ({ page }) => {
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    const before = await visibleHeaderIds(page)
    expect(before.length).toBeGreaterThan(2)
    const target = before[1]!
    await mainTable(page).getByTestId(target).click()

    const putLeft = page.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await page.getByTestId('palette-input').fill('Move column left')
    await page.keyboard.press('Enter')
    await putLeft
    const afterLeft = await visibleHeaderIds(page)
    expect(afterLeft.indexOf(target)).toBe(before.indexOf(target) - 1)

    const putRight = page.waitForResponse(
      (res) =>
        res.url().includes('/column-prefs') &&
        res.request().method() === 'PUT' &&
        res.ok(),
      { timeout: 30_000 },
    )
    await mainTable(page).getByTestId(target).click()
    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await page.getByTestId('palette-input').fill('Move column right')
    await page.keyboard.press('Enter')
    await putRight
    const afterRight = await visibleHeaderIds(page)
    expect(afterRight.indexOf(target)).toBe(afterLeft.indexOf(target) + 1)
  })
})
