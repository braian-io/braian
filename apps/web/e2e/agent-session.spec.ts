import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { expectToastClearsLists, mainTable, paneWithTab, setTheme } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const row = mainTable(page).getByTestId('object-row').first()
  const shown = await row.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false)
  if (!shown) {
    const productsTab = page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first()
    if (await productsTab.count()) await productsTab.click()
  }
  await expect(row).toBeVisible({ timeout: 60_000 })
}

async function ask(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
}

function agentView(page: Page, title: string) {
  return page.getByTestId('agent-view').filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) }).last()
}

async function expectReadable(page: Page, selector: string, minimum: number) {
  const failures = await page.locator(selector).evaluateAll((nodes, floor) => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
    }
    const channel = (value: number) => {
      const scaled = value / 255
      return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
    }
    const lum = (color: { r: number; g: number; b: number }) =>
      0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
    const opaque = (node: Element | null): { r: number; g: number; b: number } => {
      if (!(node instanceof Element)) return { r: 255, g: 255, b: 255 }
      const color = parse(getComputedStyle(node).backgroundColor)
      const parent = opaque(node.parentElement)
      if (!color || color.a === 0) return parent
      return {
        r: color.r * color.a + parent.r * (1 - color.a),
        g: color.g * color.a + parent.g * (1 - color.a),
        b: color.b * color.a + parent.b * (1 - color.a),
      }
    }
    return nodes.flatMap((node) => {
      if (!(node instanceof HTMLElement) || node.getClientRects().length === 0) return []
      const style = getComputedStyle(node)
      const fg = parse(style.color)
      const bg = opaque(node)
      if (!fg) return [`${node.tagName} has no color`]
      const painted = {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
      }
      const hi = Math.max(lum(painted), lum(bg))
      const lo = Math.min(lum(painted), lum(bg))
      const ratio = (hi + 0.05) / (lo + 0.05)
      const label = (node.innerText || node.getAttribute('aria-label') || node.className).replace(/\s+/g, ' ').trim().slice(0, 48)
      if (ratio + 0.05 >= floor && label.length > 0) return []
      return [`${label || node.className} ${ratio.toFixed(2)}:1`]
    })
  }, minimum)
  expect(failures, `${selector} below ${minimum}:1`).toEqual([])
}

async function expectSessionContrast(page: Page) {
  if (await page.getByTestId('agent-show').count()) await expectReadable(page, '[data-testid="agent-show"]', 4.5)
  if (await page.getByTestId('agent-session-bar').count()) {
    await expectReadable(page, '[data-testid="agent-session-bar"]', 4.5)
    await expectReadable(page, '[data-testid="agent-back"]', 4.5)
  }
  if (await page.getByTestId('agent-control-bar').count()) {
    await expectReadable(page, '[data-testid="agent-control-bar"]', 4.5)
    await expectReadable(page, '[data-testid="agent-take-over"]', 4.5)
  }
  if (await page.locator('[data-sonner-toast]').count()) {
    await expectReadable(page, '[data-sonner-toast]', 4.5)
  }
}

async function settle(page: Page, theme: 'dark' | 'light') {
  await setTheme(page, theme)
  await expect(page.locator('html')).not.toHaveAttribute('data-theme-switching', '')
}

async function shot(page: Page, name: string) {
  const dir = process.env.BRAIAN_AGENT_SHOTS
  for (const theme of ['dark', 'light'] as const) {
    await settle(page, theme)
    await expectSessionContrast(page)
    if (dir) await page.screenshot({ path: `${dir}/${name}-${theme}.png` })
  }
}

test('show opens the hidden session and edits there become proposals', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'hold the run in your own session'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view).toHaveAttribute('data-session-kind', 'own')
  await expect(view).toHaveAttribute('data-hidden', 'true')
  const send = view.getByTestId('agent-send')
  await expect(send).toBeDisabled()
  await expect(send).toHaveText('Send')
  await expectReadable(page, '[data-testid="agent-send"]', 3)
  await expect(view.getByTestId('agent-show')).toHaveText('Show session')
  await expect(view.getByTestId('agent-show')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.app')).not.toHaveAttribute('data-agent-control', 'true')
  await expect(page.locator('[data-view-type="object_detail"]')).toBeVisible()
  await shot(page, 'agent-show')

  await view.getByTestId('agent-show').click()
  const bar = page.getByTestId('agent-session-bar')
  await expect(bar).toContainText("You're viewing the agent's session")
  await expect(bar.getByTestId('agent-back')).toHaveText('Back to mine')
  await expect(page.locator('section.pane[data-agent-working="true"]').first()).toBeVisible()
  await expect(page.locator('[data-view-type="object_detail"]')).toHaveCount(0)
  await shot(page, 'agent-session')

  const row = mainTable(page).getByTestId('object-row').first()
  const name = row.locator('[data-column="name"]').first()
  const original = ((await name.innerText()) ?? '').trim()
  expect(original.length).toBeGreaterThan(0)
  await name.dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill(`${original} draft`)
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(name).toHaveText(original)
  await expect(page.getByTestId('activity-log')).toContainText('Proposed — waiting for approval')

  const agentTab = page.locator('.pane-tab[data-view-type="agent"]').last()
  if ((await agentTab.count()) === 0) await page.getByTestId('agent-back').click()
  await agentTab.click()
  await expect(page.getByTestId('agent-proposal')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('agent-proposal')).toContainText('draft')
  await shot(page, 'agent-session-proposal')

  if (await page.getByTestId('agent-back').count()) await page.getByTestId('agent-back').click()
  await expect(page.getByTestId('agent-session-bar')).toHaveCount(0)
  await expect(page.locator('[data-view-type="object_detail"]')).toBeVisible()
  await expect(view).toHaveAttribute('data-hidden', 'true')
})

test('the user session gets a purple frame until take over', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'open the product view and hold the run'
  await ask(page, title)
  await expect(page.locator('.app')).toHaveAttribute('data-agent-control', 'true', { timeout: 15_000 })
  const bar = page.getByTestId('agent-control-bar')
  await expect(bar).toContainText('The agent is using your session')
  await expect(bar.getByTestId('agent-take-over')).toHaveText('Take over')
  await expect(page.locator('section.pane[data-agent-working="true"]').first()).toBeVisible()
  await expect(page.getByTestId('workspace')).toHaveAttribute('inert', '')
  const second = mainTable(page).getByTestId('object-row').nth(1)
  await expect(second).toHaveAttribute('aria-selected', 'false')
  await second.locator('[data-column="number"], [data-column="key"]').first().click({ timeout: 1_000 }).catch(() => undefined)
  await expect(second).toHaveAttribute('aria-selected', 'false')
  await expectSessionContrast(page)
  const darkDir = process.env.BRAIAN_AGENT_SHOTS
  if (darkDir) await page.screenshot({ path: `${darkDir}/agent-control-dark.png` })
  const productsGrid = paneWithTab(page, 'Products').locator('.grid').first()
  await productsGrid.evaluate((node) => {
    node.scrollLeft = 420
  })
  await expect.poll(async () => productsGrid.evaluate((node) => node.scrollLeft)).toBeGreaterThan(200)

  await page.getByTestId('agent-take-over').click()
  await expect(page.locator('.app')).not.toHaveAttribute('data-agent-control', 'true')
  await expect(page.getByTestId('agent-control-bar')).toHaveCount(0)
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveAttribute('data-status', 'paused')
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveText('Paused')
  await expect(page.getByTestId('workspace')).not.toHaveAttribute('inert', '')
  const grid = paneWithTab(page, 'Products').locator('.grid').first()
  await expect.poll(async () => grid.evaluate((node) => node.scrollLeft)).toBeLessThan(8)
  const number = paneWithTab(page, 'Products').getByTestId('col-number')
  const name = paneWithTab(page, 'Products').getByTestId('col-name')
  await expect(number).toBeVisible()
  await expect(name).toBeVisible()
  const paneBox = await paneWithTab(page, 'Products').boundingBox()
  const numberBox = await number.boundingBox()
  const nameBox = await name.boundingBox()
  expect(paneBox && numberBox && nameBox).toBeTruthy()
  expect(numberBox!.x).toBeGreaterThanOrEqual(paneBox!.x - 1)
  expect(nameBox!.x).toBeGreaterThanOrEqual(numberBox!.x)
  expect(nameBox!.x + 24).toBeLessThanOrEqual(paneBox!.x + paneBox!.width)
  await second.locator('[data-column="number"], [data-column="key"]').first().click()
  await expect(second).toHaveAttribute('aria-selected', 'true')
  await expect.poll(async () => grid.evaluate((node) => node.scrollLeft)).toBeLessThan(8)
  await shot(page, 'agent-taken-over')

  await setTheme(page, 'light')
  const again = 'open the product view and hold the run again'
  await ask(page, again)
  await expect(page.locator('.app')).toHaveAttribute('data-agent-control', 'true', { timeout: 15_000 })
  await expectSessionContrast(page)
  if (darkDir) await page.screenshot({ path: `${darkDir}/agent-control-light.png` })
  await page.getByTestId('agent-take-over').click()
  await expect(agentView(page, again).getByTestId('agent-status')).toHaveAttribute('data-status', 'paused')
})

test('a waiting notice sits in the gutter on one line', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'ask me before you continue with the winter assortment name that is far too long for one toast'
  await ask(page, title)
  const view = page.getByTestId('agent-view').filter({ hasText: 'winter assortment' })
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'waiting', { timeout: 30_000 })
  await view.getByTestId('agent-mode').click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'waiting for you' })
  await expect(toast).toBeVisible({ timeout: 15_000 })
  await expect(toast.getByRole('button', { name: 'Answer' })).toBeVisible()
  const metrics = await toast.locator('[data-title]').evaluate((node) => {
    const style = getComputedStyle(node)
    const box = node.getBoundingClientRect()
    return {
      whiteSpace: style.whiteSpace,
      height: box.height,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })
  expect(metrics.whiteSpace).toBe('nowrap')
  expect(metrics.height).toBeLessThan(28)
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth)
  const toastBox = await toast.boundingBox()
  const viewport = page.viewportSize()
  expect(toastBox).toBeTruthy()
  expect(viewport).toBeTruthy()
  expect(toastBox!.y + toastBox!.height).toBeGreaterThan((viewport?.height ?? 0) - 120)
  await expectToastClearsLists(page, toast)
  await shot(page, 'agent-waiting-gutter')
})

test('the agents table lists waiting rows first', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await ask(page, 'hold the run for the agents table')
  const waitingTitle = 'ask me before the agents table sorts'
  await ask(page, waitingTitle)
  await expect(agentView(page, waitingTitle).getByTestId('agent-status')).toHaveAttribute('data-status', 'waiting', { timeout: 30_000 })
  await page.keyboard.press('Control+k')
  await page.getByTestId('palette-input').fill('Agents table')
  await expect(page.getByTestId('command-palette').locator('.hit.on')).toContainText('Agents table')
  await page.keyboard.press('Enter')
  const table = page.getByTestId('agents-table')
  await expect(table).toBeVisible()
  await expect.poll(async () => table.getByTestId('agent-table-row').allInnerTexts()).toEqual(expect.arrayContaining([expect.stringContaining('Waiting'), expect.stringContaining('Working')]))
  const texts = await table.getByTestId('agent-table-row').allInnerTexts()
  const waiting = texts.findIndex((text) => text.includes('Waiting'))
  const working = texts.findIndex((text) => text.includes('Working'))
  expect(waiting).toBeGreaterThanOrEqual(0)
  expect(working).toBeGreaterThan(waiting)
  await shot(page, 'agent-table-waiting')
})
