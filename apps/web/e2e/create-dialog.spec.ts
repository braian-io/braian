import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

const shots = process.env.BRAIAN_CREATE_SHOTS

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function workspace(page: Page, name: RegExp) {
  await page.locator('nav.tabs').getByRole('button', { name }).click()
}

async function shootThemes(page: Page, opener: Locator, dialog: Locator, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  for (const theme of ['dark', 'light'] as const) {
    if (await dialog.count()) {
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
    }
    await setTheme(page, theme)
    await opener.click()
    await expect(dialog).toBeVisible()
    await dialog.screenshot({ path: `${shots}/${name}-${theme}.png` })
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await setTheme(page, 'dark')
}

/** Focus paints the control's own border, not a second ring outside it. */
async function expectFocusBorder(control: Locator) {
  const paint = await control.evaluate((el) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--accent)'
    document.body.append(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    const style = getComputedStyle(el)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderTopWidth: Number.parseFloat(style.borderTopWidth),
      boxShadow: style.boxShadow,
      accent,
    }
  })
  expect(paint.outlineStyle).toBe('none')
  expect(paint.outlineWidth).toBe(0)
  expect(paint.borderTopWidth).toBeGreaterThan(0)
  expect(paint.borderTopColor).toBe(paint.accent)
  expect(paint.borderRightColor).toBe(paint.accent)
  expect(paint.borderBottomColor).toBe(paint.accent)
  expect(paint.borderLeftColor).toBe(paint.accent)
  expect(paint.boxShadow).toBe('none')
}

async function trap(page: Page, dialog: Locator) {
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab')
    const inside = await dialog.evaluate((node) => node.contains(document.activeElement))
    expect(inside).toBe(true)
  }
  await page.keyboard.press('Shift+Tab')
  const inside = await dialog.evaluate((node) => node.contains(document.activeElement))
  expect(inside).toBe(true)
}

async function rejectWrites(page: Page, url: string, hold: boolean) {
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let finished = Promise.resolve()
  await page.route(url, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    let settle: () => void = () => undefined
    finished = new Promise<void>((resolve) => {
      settle = resolve
    })
    try {
      if (hold) await held
      await route.fulfill({
        status: 422,
        contentType: 'application/problem+json',
        body: JSON.stringify({ detail: 'number already exists' }),
      })
    } finally {
      settle()
    }
  })
  return async () => {
    release()
    await finished
    await page.unroute(url)
  }
}

async function fill(dialog: Locator, fields: Record<string, string>) {
  for (const [testId, value] of Object.entries(fields)) {
    await dialog.getByTestId(testId).fill(value)
  }
}

/**
 * Open, trap focus, Escape from the first field, Escape during a save,
 * Escape after a server error (values stay), Cancel, then a successful create.
 */
async function exercise(page: Page, options: {
  opener: Locator
  dialogTestId: string
  title: string
  shot: string
  firstField: string
  failure: Record<string, string>
  success: Record<string, string>
  route: string
  selected: Locator
}) {
  const { opener } = options
  await expect(opener).toBeVisible()
  const dialog = page.getByTestId(options.dialogTestId)
  await shootThemes(page, opener, dialog, options.shot)
  await opener.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: options.title })).toBeVisible()
  const first = dialog.getByTestId(options.firstField)
  await expect(first).toBeFocused()
  await expectFocusBorder(first)
  await trap(page, dialog)
  await first.click()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  const stopHeld = await rejectWrites(page, options.route, true)
  await opener.click()
  await expect(dialog).toBeVisible()
  await fill(dialog, options.failure)
  await page.keyboard.press('Enter')
  await expect(dialog.getByTestId('create-object')).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await stopHeld()

  const stop = await rejectWrites(page, options.route, false)
  await opener.click()
  await expect(dialog).toBeVisible()
  await fill(dialog, options.failure)
  await page.keyboard.press('Enter')
  const alert = dialog.getByRole('alert')
  await expect(alert).toBeVisible()
  await expect(alert).toContainText('number already exists')
  if (shots && options.shot === 'new-product') {
    await dialog.screenshot({ path: `${shots}/server-error-dark.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await setTheme(page, 'light')
    await opener.click()
    await expect(dialog).toBeVisible()
    await fill(dialog, options.failure)
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('alert')).toContainText('number already exists')
    await dialog.screenshot({ path: `${shots}/server-error-light.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await setTheme(page, 'dark')
    await opener.click()
    await expect(dialog).toBeVisible()
    await fill(dialog, options.failure)
    await page.keyboard.press('Enter')
    await expect(dialog.getByRole('alert')).toContainText('number already exists')
  }
  for (const [testId, value] of Object.entries(options.failure)) {
    await expect(dialog.getByTestId(testId)).toHaveValue(value)
  }
  await dialog.getByTestId(options.firstField).focus()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
  await stop()

  await opener.click()
  await expect(dialog).toBeVisible()
  await fill(dialog, options.failure)
  await dialog.getByTestId('create-cancel').click()
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  await opener.click()
  await expect(dialog).toBeVisible()
  await fill(dialog, options.success)
  await page.keyboard.press('Enter')
  await expect(dialog).toHaveCount(0)
  await expect(options.selected).toBeVisible({ timeout: 30_000 })
}

test('Products create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await workspace(page, /^Products/)
  const table = mainTable(page, 'Products')
  const number = `E2E-P-${Date.now().toString().slice(-8)}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'new-object',
    title: 'New product',
    shot: 'new-product',
    firstField: 'new-number',
    failure: { 'new-number': 'DUP-PRODUCT', 'new-name': 'Duplicate product' },
    success: { 'new-number': number, 'new-name': `Product ${number}` },
    route: '**/v1/objects',
    selected: table.getByTestId('object-row').filter({ hasText: number }),
  })
  await expect(table.getByTestId('object-row').filter({ hasText: number })).toHaveAttribute('aria-selected', 'true')
})

test('Articles create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await workspace(page, /^Articles/)
  const table = mainTable(page, 'Articles')
  const number = `E2E-A-${Date.now().toString().slice(-8)}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'new-object',
    title: 'New article',
    shot: 'new-article',
    firstField: 'new-number',
    failure: { 'new-number': 'DUP-ARTICLE', 'new-name': 'Duplicate article' },
    success: { 'new-number': number, 'new-name': `Article ${number}` },
    route: '**/v1/objects',
    selected: table.getByTestId('object-row').filter({ hasText: number }),
  })
  await expect(table.getByTestId('object-row').filter({ hasText: number })).toHaveAttribute('aria-selected', 'true')
})

test('Suppliers create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await workspace(page, /^Suppliers/)
  const table = mainTable(page, 'Suppliers')
  const number = `E2E-S-${Date.now().toString().slice(-8)}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'new-object',
    title: 'New supplier',
    shot: 'new-supplier',
    firstField: 'new-number',
    failure: { 'new-number': 'DUP-SUPPLIER', 'new-name': 'Duplicate supplier' },
    success: { 'new-number': number, 'new-name': `Supplier ${number}` },
    route: '**/v1/objects',
    selected: table.getByTestId('object-row').filter({ hasText: number }),
  })
  await expect(table.getByTestId('object-row').filter({ hasText: number })).toHaveAttribute('aria-selected', 'true')
})

async function modelTab(page: Page, title: string) {
  await workspace(page, /^Data model/)
  const tab = page.locator('.pane-tab').filter({ hasText: title }).first()
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
}

test('From type select stays readable in dark theme', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await setTheme(page, 'dark')
  await modelTab(page, 'Link types')
  const table = page.getByTestId('link-types-table')
  await table.getByTestId('table-add-row').click()
  const dialog = page.getByTestId('create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'New link type' })).toBeVisible()
  const from = dialog.getByTestId('new-type')
  await expect(from).toBeVisible()
  // Themed Select trigger — not a native <select> that paints white.
  await expect(from).toHaveRole('combobox')
  const paint = await from.evaluate((el) => {
    const style = getComputedStyle(el)
    const probe = document.createElement('span')
    probe.style.color = 'var(--text)'
    document.body.append(probe)
    const text = getComputedStyle(probe).color
    probe.remove()
    return {
      color: style.color,
      background: style.backgroundColor,
      text,
      tag: el.tagName,
    }
  })
  expect(paint.tag).toBe('BUTTON')
  expect(paint.color).toBe(paint.text)
  expect(paint.background).not.toBe('rgb(255, 255, 255)')
  await from.click()
  const list = page.getByTestId('new-type-list')
  await expect(list).toBeVisible()
  const listPaint = await list.evaluate((el) => {
    const style = getComputedStyle(el)
    const probe = document.createElement('span')
    probe.style.color = 'var(--raised)'
    document.body.append(probe)
    const raised = getComputedStyle(probe).color
    probe.remove()
    return { background: style.backgroundColor, raised }
  })
  expect(listPaint.background).toBe(listPaint.raised)
  expect(listPaint.background).not.toBe('rgb(255, 255, 255)')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('Object types create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Object types')
  const table = page.getByTestId('object-types-table')
  const suffix = Date.now().toString().slice(-6)
  const key = `kind_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New type',
    shot: 'new-object-type',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate type' },
    success: { 'new-name': `Kind ${suffix}`, 'new-plural': `Kinds ${suffix}` },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-row-id="${key}"]`),
  })
  await expect(table.locator(`[data-row-id="${key}"]`)).toHaveClass(/\bon\b/)
})

test('Link types create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Link types')
  const table = page.getByTestId('link-types-table')
  const suffix = Date.now().toString().slice(-6)
  const key = `bundled_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New link type',
    shot: 'new-link-type',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate link' },
    success: { 'new-name': `Bundled ${suffix}` },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-row-id="${key}"]`),
  })
  await expect(table.locator(`[data-row-id="${key}"]`)).toHaveClass(/\bon\b/)
})

test('Value lists create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Value lists')
  const table = page.getByTestId('value-lists-table')
  const suffix = Date.now().toString().slice(-6)
  const key = `shade_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New value list',
    shot: 'new-value-list',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate list' },
    success: { 'new-name': `Shade ${suffix}` },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-row-id="${key}"]`),
  })
  await expect(table.locator(`[data-row-id="${key}"]`)).toHaveClass(/\bon\b/)
})

test('List values create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Value lists')
  await page.getByTestId('value-lists-table').locator('[data-row-id="status"]').click()
  await modelTab(page, 'List values')
  const table = page.getByTestId('value-list-values-table')
  await expect(table).toBeVisible()
  const suffix = Date.now().toString().slice(-6)
  const code = `held_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New value',
    shot: 'new-list-value',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate value' },
    success: { 'new-name': `Held ${suffix}` },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-row-id="status:${code}"]`),
  })
  await expect(table.locator(`[data-row-id="status:${code}"]`)).toHaveClass(/\bon\b/)
})

test('Units create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Units')
  const table = page.getByTestId('units-table')
  const suffix = Date.now().toString().slice(-6)
  const family = `e2e_mass_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New unit',
    shot: 'new-unit',
    firstField: 'new-name',
    failure: { 'new-name': 'duplicate_family', 'new-key': 'g' },
    success: { 'new-name': family, 'new-key': 'gram', 'new-factor': '1' },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-row-id="${family}:gram"]`),
  })
  await expect(table.locator(`[data-row-id="${family}:gram"]`)).toHaveClass(/\bon\b/)
})

test('Attribute definitions create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Attribute definitions')
  const table = page.getByTestId('attribute-definitions-chrome')
  const suffix = Date.now().toString().slice(-6)
  const key = `colour_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New attribute',
    shot: 'new-attribute-definition',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate attribute' },
    success: { 'new-name': `Colour ${suffix}` },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-key="${key}"]`),
  })
  await expect(table.locator(`[data-key="${key}"]`)).toHaveClass(/\bon\b/)
})

test('Type attributes create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Object types')
  await page.getByTestId('object-types-table').locator('[data-row-id="product"]').click()
  await modelTab(page, 'Type attributes')
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  const suffix = Date.now().toString().slice(-6)
  const key = `extra_${suffix}`
  await exercise(page, {
    opener: table.getByTestId('table-add-row'),
    dialogTestId: 'create-dialog',
    title: 'New attribute',
    shot: 'new-type-attribute',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate field' },
    success: { 'new-name': `Extra ${suffix}` },
    route: '**/v1/model/draft/steps',
    selected: table.locator(`[data-key="${key}"]`),
  })
  await expect(table.locator(`[data-key="${key}"]`)).toHaveClass(/\bon\b/)
})

test('Structures create dialog', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await modelTab(page, 'Structures')
  const suffix = Date.now().toString().slice(-6)
  const key = `canopy_${suffix}`
  await exercise(page, {
    opener: page.getByTestId('new-structure'),
    dialogTestId: 'create-dialog',
    title: 'New structure',
    shot: 'new-structure',
    firstField: 'new-name',
    failure: { 'new-name': 'Duplicate tree' },
    success: { 'new-name': `Canopy ${suffix}` },
    route: '**/v1/structures:create',
    selected: page.getByTestId(`structure-${key}`),
  })
  await expect(page.getByTestId(`structure-${key}`)).toHaveAttribute('data-selected', 'true')
})
