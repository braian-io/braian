// Agent chat pane: tab title, session header, and follow-up focus ring.
import { expect, test, type Page } from '@playwright/test'
import { agentPaneTab, agentSessionView, agentSessionViewByFullPrompt, mainTable, paneWithTab } from './ui'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
}

async function openAgentAsk(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
}

async function agentInputChrome(page: Page) {
  const input = page.getByTestId('agent-follow-up').last()
  await input.focus()
  return input.evaluate((node) => {
    const style = getComputedStyle(node)
    return { boxShadow: style.boxShadow, outlineWidth: style.outlineWidth }
  })
}

async function searchFieldChrome(page: Page, field: ReturnType<Page['locator']>) {
  const input = field.locator('input').first()
  await input.focus()
  return field.evaluate((node) => {
    const style = getComputedStyle(node)
    return { boxShadow: style.boxShadow, outlineWidth: style.outlineWidth }
  })
}

async function cleanupDrafts(page: Page) {
  await page.getByTestId('discard-draft').first().click({ timeout: 5_000 }).catch(() => undefined)
  const discardAll = page.getByRole('button', { name: 'Discard all' })
  if ((await discardAll.count()) > 0 && (await discardAll.isEnabled())) {
    await discardAll.click({ timeout: 15_000 }).catch(() => undefined)
  }
  await page.keyboard.press('Control+j').catch(() => undefined)
  await page.keyboard.press('Control+j').catch(() => undefined)
}

test('agent pane tab and session header stay readable', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const prompt = `byt namn på den här produkten till polish ${Date.now().toString().slice(-4)}`
  const products = mainTable(page, 'Products')
  await products.getByTestId('object-row').first().click()
  try {
    await openAgentAsk(page, prompt)
    const tab = agentPaneTab(page)
    await expect(tab).toBeVisible({ timeout: 30_000 })
    await expect(tab).toHaveText(/^Agent$/)
    const shortTitle = 'byt namn på den här'
    await expect.poll(async () => tab.getAttribute('title')).toBe(`Agent — ${shortTitle}`)
    const view = agentSessionView(page, shortTitle)
    await expect(view).toBeVisible()
    const heading = view.getByTestId('agent-session-title')
    await expect(heading).toContainText(shortTitle)
    await expect(heading).toHaveAttribute('title', prompt)
    const headerStyle = await heading.evaluate((node) => {
      const style = getComputedStyle(node)
      return { lineClamp: style.webkitLineClamp, whiteSpace: style.whiteSpace, textOverflow: style.textOverflow }
    })
    expect(headerStyle.lineClamp).toBe('2')
    expect(headerStyle.whiteSpace).not.toBe('nowrap')
    expect(headerStyle.textOverflow).not.toBe('ellipsis')
    await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  } finally {
    await cleanupDrafts(page)
  }
})

test('long first message keeps full prompt on the session header', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const marker = `k2-${Date.now().toString().slice(-6)}`
  const longToken = `${'Z'.repeat(72)}${marker}`
  const prompt = `Please summarize how this catalog row differs from its assortment baseline without changing any values — ${longToken}`
  const products = mainTable(page, 'Products')
  await products.getByTestId('object-row').first().click()
  try {
    await openAgentAsk(page, prompt)
    const tab = agentPaneTab(page)
    await expect(tab).toBeVisible({ timeout: 30_000 })
    const shortTitle = 'Please summarize how this catalog row'
    await expect.poll(async () => tab.getAttribute('title')).toBe(`Agent — ${shortTitle}`)
    const view = agentSessionViewByFullPrompt(page, marker)
    await expect(view).toBeVisible()
    const heading = view.getByTestId('agent-session-title')
    await expect(heading).toHaveAttribute('title', prompt)
    const overflow = await view.evaluate((node) => {
      const pane = node.closest('section.pane')
      const title = node.querySelector<HTMLElement>('[data-testid="agent-session-title"]')
      if (!pane || !title) return { ok: false }
      const paneBox = pane.getBoundingClientRect()
      const titleBox = title.getBoundingClientRect()
      return {
        ok: titleBox.right <= paneBox.right + 1 && titleBox.left >= paneBox.left - 1,
        paneWidth: paneBox.width,
        titleWidth: titleBox.width,
      }
    })
    expect(overflow.ok, `title box ${overflow.titleWidth} vs pane ${overflow.paneWidth}`).toBe(true)
    await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  } finally {
    await cleanupDrafts(page)
  }
})

test('follow-up focus ring matches search fields in three views', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await login(page)
  const prompt = `describe the catalog layout ${Date.now().toString().slice(-4)}`
  const products = mainTable(page, 'Products')
  await products.getByTestId('object-row').first().click()
  try {
    await openAgentAsk(page, prompt)
    const shortTitle = 'describe the catalog layout'
    const view = agentSessionView(page, shortTitle)
    await expect(view).toBeVisible({ timeout: 30_000 })
    const docked = await agentInputChrome(page)

    await paneWithTab(page, 'Products').getByTestId('quick-filter').focus()
    const tableField = paneWithTab(page, 'Products').locator('.search-field').first()
    const table = await searchFieldChrome(page, tableField)
    expect(docked.boxShadow).toBe(table.boxShadow)
    expect(docked.outlineWidth).toBe(table.outlineWidth)

    await page.keyboard.press('Control+k')
    await page.getByTestId('palette-input').fill('Agents table')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('agents-table')).toBeVisible({ timeout: 30_000 })
    const agentsField = page.locator('section.pane').filter({ has: page.getByTestId('agents-table') }).locator('.search-field').first()
    const agents = await searchFieldChrome(page, agentsField)
    expect(docked.boxShadow).toBe(agents.boxShadow)
    expect(docked.outlineWidth).toBe(agents.outlineWidth)

    await agentPaneTab(page, shortTitle).click()
    await expect(view.getByTestId('agent-follow-up')).toBeFocused()
    const refocused = await agentInputChrome(page)
    expect(refocused).toEqual(docked)
  } finally {
    await cleanupDrafts(page)
  }
})