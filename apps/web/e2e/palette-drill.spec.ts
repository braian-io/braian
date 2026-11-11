import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const baseURL = process.env.BRAIAN_WEB_URL ?? 'http://127.0.0.1:3000'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  // The layout is restored from the server and shared by every test in this
  // file. An earlier test can leave an agent tab focused, which hides the
  // object table even though the workspace still has it open. Activate a
  // table instead of assuming the saved focus.
  const tableTab = page.locator('.pane-tab[data-view-type="object_table"]').first()
  await expect(tableTab).toBeVisible({ timeout: 60_000 })
  if ((await page.getByTestId('object-row').count()) === 0) await tableTab.click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function openPalette(page: Page) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  return palette
}

/**
 * The first ArrowDown can also finish loading the grouped command list, so the
 * option order may change after the highlight has moved. Sample the order only
 * once two reads agree that it has settled.
 */
async function waitForStableOptions(palette: Locator, timeout = 15_000): Promise<string[]> {
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
  return stable
}

test.describe('palette drill-in, recent order, and global commands', () => {
  test('Tab on Open view drills in, lists views, and does not ask AI', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)

    await page.getByTestId('palette-input').fill('Open view')
    const command = palette.locator('.hit.on')
    await expect(command).toContainText('Open view')
    await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*Open/)
    await expect(palette.locator('.palette-heading', { hasText: 'Best match' })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: /^Articles view/ })).toHaveCount(0)
    await expect(palette.locator('.hit.on')).toHaveCount(1)

    await page.keyboard.press('Tab')
    await expect(page.locator('.palette-query').getByTestId('palette-crumb')).toContainText('Open view ›')
    await expect(page.getByTestId('palette-input')).toHaveAttribute('placeholder', 'Search views…')
    await expect(page.getByTestId('palette-back-hint')).toHaveText('⌫ Back')
    const articles = palette.getByRole('option', { name: /^Articles\b/ }).first()
    await articles.scrollIntoViewIfNeeded()
    await expect(articles).toBeVisible()
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await expect(page.getByTestId('ai-log')).toHaveCount(0)

    await palette.getByRole('option', { name: /^Articles\b/ }).first().click()
    await expect(palette).toHaveCount(0)
    await expect(page.locator('.pane-tab', { hasText: 'Articles' }).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Enter on Open view drills in, lists views, and does not ask AI', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)

    await page.getByTestId('palette-input').fill('Open view')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*Open/)
    await page.keyboard.press('Enter')

    await expect(page.locator('.palette-query').getByTestId('palette-crumb')).toContainText('Open view ›')
    await expect(page.getByTestId('palette-input')).toHaveAttribute('placeholder', 'Search views…')
    const articles = palette.getByRole('option', { name: /^Articles\b/ }).first()
    await articles.scrollIntoViewIfNeeded()
    await expect(articles).toBeVisible()
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await expect(page.getByTestId('ai-log')).toHaveCount(0)

    await page.getByTestId('palette-input').fill('Articles')
    await expect(palette.locator('.hit.on')).toContainText('Articles')
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)
    await expect(page.locator('.pane-tab', { hasText: 'Articles' }).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Recent lists the last command first after two runs', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)

    async function run(query: string) {
      const palette = await openPalette(page)
      await page.getByTestId('palette-input').fill(query)
      await expect(palette.locator('.hit.on')).toContainText(query)
      await page.keyboard.press('Enter')
      await expect(palette).toHaveCount(0)
    }

    async function drill(query: string) {
      const palette = await openPalette(page)
      await page.getByTestId('palette-input').fill(query)
      await expect(palette.locator('.hit.on')).toContainText(query)
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('palette-crumb')).toContainText(query)
      await page.keyboard.press('Escape')
      await expect(palette).toHaveCount(0)
    }

    await drill('Open view')
    await drill('Open product')
    await run('Move left')
    await run('Reset layout')
    await run('Reset layout')

    const palette = await openPalette(page)
    const recent = palette.locator('.palette-group').filter({
      has: page.locator('.palette-heading', { hasText: 'Recent' }),
    })
    await expect(recent.getByRole('option').nth(0)).toContainText('Open product')
    await expect(recent.getByRole('option').nth(1)).toContainText('Open view')
    await expect(recent.getByRole('option', { name: /Move left/ })).toHaveCount(0)
    await expect(recent.getByRole('option', { name: /Reset layout/ })).toHaveCount(0)
  })

  test('shows no product context section while a product is open', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const row = page.getByTestId('object-row').first()
    await row.click({ button: 'right' })
    const menu = page.getByTestId('context-menu')
    await expect(menu.getByRole('menuitem', { name: /Open to the right/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await row.click()
    await expect(page.getByTestId('object-detail')).toBeVisible({ timeout: 30_000 })

    const palette = await openPalette(page)
    await expect(palette.locator('.palette-heading', { hasText: /^On this/ })).toHaveCount(0)
    await expect(palette.locator('.palette-heading', { hasText: 'On selected object' })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: 'Open to the right' })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: /Move to group/ })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: 'Copy id' })).toHaveCount(0)
    await expect(palette.getByText('As it was, and restore')).toHaveCount(0)
    await expect(palette.getByText('Links and where values come from')).toHaveCount(0)
    await expect(palette.getByRole('option', { name: /^Open view/ }).first()).toBeVisible()
  })

  test('ranks Open view first for ov and open v', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')

    await input.fill('ov')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await expect(palette.locator('.hit.on')).toHaveCount(1)
    await expect(palette.locator('.palette-heading', { hasText: 'Best match' })).toHaveCount(0)

    await input.fill('open v')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*Open/)
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
  })

  test('Backspace leaves a drill-in and Esc closes the palette', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    await page.getByTestId('palette-input').fill('Open view')
    await expect(palette.locator('.hit.on')).toContainText('Open view')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open view ›')
    await expect(page.getByTestId('palette-crumb')).toHaveAttribute('aria-label', 'Open view, press Backspace to go back')
    await expect(page.getByTestId('palette-back-hint')).toBeVisible()
    await expect(page.getByTestId('palette-foot')).toContainText(/Esc\s*Close/)
    await page.keyboard.press('Backspace')
    await expect(page.getByTestId('palette-crumb')).toBeEmpty()
    await expect(palette).toBeVisible()
    await page.getByTestId('palette-input').fill('Open product')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('palette-crumb')).toContainText('Open product ›')
    await page.keyboard.press('Escape')
    await expect(palette).toHaveCount(0)
  })

  test('Ctrl+J asks and Tab does not', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')
    await input.fill('how many products')
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await expect(palette).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('ai-badge')).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(palette).toHaveCount(0)
    const agentTab = page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: 'how many products' })
    await expect(agentTab).toBeVisible({ timeout: 30_000 })
    await agentTab.click()
    await expect(page.getByTestId('agent-view').filter({ hasText: 'how many products' })).toContainText('how many products')
    await expect(page.getByTestId('agent-answer')).toHaveCount(0, { timeout: 30_000 })
    await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
    await expect(page.getByTestId('object-row').first()).toBeVisible()
  })

  test('arrows move the highlight and Home and End stay in the query', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')
    await input.focus()
    await expect.poll(async () => palette.getByRole('option').count()).toBeGreaterThan(1)
    await waitForStableOptions(palette)
    await page.keyboard.press('ArrowDown')
    const highlighted = palette.locator('.hit.on')
    await expect(highlighted).toBeVisible()
    await waitForStableOptions(palette)
    const first = await highlighted.getAttribute('data-value')
    expect(first).toBeTruthy()
    await page.keyboard.press('ArrowDown')
    await expect(highlighted).not.toHaveAttribute('data-value', first!)
    await page.keyboard.press('ArrowUp')
    await expect(highlighted).toHaveAttribute('data-value', first!)

    await input.fill('layout')
    await input.press('Home')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0)
    await input.press('End')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe('layout'.length)
    await expect(input).toHaveValue('layout')
    await expect(palette).toBeVisible()
  })

  test('one combobox, no duplicate destinations, no-results, and the ask footer', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    const palette = await openPalette(page)
    const input = page.getByTestId('palette-input')
    await expect(input).toHaveAttribute('role', 'combobox')
    await expect(palette.locator('.hit.on')).toHaveCount(1)
    await expect(input).toHaveAttribute('aria-activedescendant', /^palette-opt-\d+$/)
    await expect(palette.locator('[aria-activedescendant]')).toHaveCount(1)
    await expect(palette.locator('[aria-selected="true"]')).toHaveCount(1)
    const selectedId = await input.getAttribute('aria-activedescendant')
    await expect(palette.locator(`[id="${selectedId}"]`)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('palette-results')).toHaveText('')
    await expect(page.getByTestId('palette-foot')).not.toContainText('Ctrl+K')
    await expect(page.locator('[data-testid="palette-active"]')).toHaveCount(0)

    const headings = (await palette.locator('.palette-heading').allTextContents()).map((text) => text.trim())
    const wanted = ['Recent', 'Navigation', 'Create', 'Data model', 'Links']
    let last = -1
    for (const name of wanted) {
      const index = headings.indexOf(name)
      if (index < 0) continue
      expect(index).toBeGreaterThan(last)
      last = index
    }
    expect(headings).toContain('Navigation')
    expect(headings).toContain('Create')
    expect(headings).toContain('Data model')
    expect(headings).toContain('Links')
    expect(headings).not.toContain('Views')
    await expect(palette.getByRole('option', { name: /^Articles view/ })).toHaveCount(0)
    await expect(palette.getByRole('option', { name: /^Link to/ }).first()).toBeVisible()

    await input.fill('Delete workspace')
    await expect(palette.locator('.hit.on')).toContainText('Delete workspace…')
    await expect(page.getByTestId('palette-results')).toHaveText(/^\d+ results?$/)

    await input.fill('zzzzqqqqnomatch')
    await expect(page.getByTestId('palette-empty')).toHaveText('No results for "zzzzqqqqnomatch"')
    await expect(palette.getByRole('option', { name: /Ask AI/ })).toBeVisible()
    await expect(page.getByTestId('palette-results')).toHaveText('0 results')
    await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/)

    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toHaveCount(1)

    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    const agentTab = page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: 'zzzzqqqqnomatch' })
    await expect(agentTab).toBeVisible()
    await agentTab.click()
    await expect(page.getByTestId('agent-view').filter({ hasText: 'zzzzqqqqnomatch' })).toBeVisible()
    await expect(page.getByTestId('activity-log')).not.toContainText('Agent:')
  })

  test('login reaches a table when the saved layout focuses an agent tab', async ({ page, browser }) => {
    test.setTimeout(180_000)
    await login(page)
    const palette = await openPalette(page)
    await page.getByTestId('palette-input').fill('how many products')
    await page.keyboard.press('Control+j')
    await expect(palette).toHaveCount(0)
    // An earlier test can leave its own agent tab behind; the run started here
    // is the one the shell focuses and appends last.
    const agentTab = page.locator('.pane-tab[data-view-type="agent"].active')
      .filter({ hasText: 'how many products' })
      .last()
    await expect(agentTab).toBeVisible({ timeout: 30_000 })

    // Leave the agent tab focused and wait for the layout save, so the next
    // login really restores an agent focus instead of a table.
    const saved = page.waitForResponse((response) =>
      response.request().method() === 'PUT'
      && new URL(response.url()).pathname.endsWith('/state')
      && response.ok(),
    )
    await agentTab.click()
    await expect(agentTab).toHaveClass(/active/)
    await saved

    const context = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
      locale: 'sv-SE',
    })
    try {
      const fresh = await context.newPage()
      await login(fresh)
      await expect(fresh.getByTestId('object-row').first()).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
