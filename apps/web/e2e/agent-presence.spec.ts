import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

async function showProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first().click()
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function resetProductsLayout(page: Page) {
  await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
  const listed = await page.request.get('/v1/workspaces')
  const body = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
  const workspace = body.workspaces.find((item) => item.name === 'Products')
  const me = await page.request.get('/v1/me')
  const userId = ((await me.json()) as { user_id?: string }).user_id
  if (userId && workspace) {
    await page.evaluate((key) => localStorage.removeItem(key), `braian.layout.${userId}.default.${workspace.id}`)
    await page.request.delete(`/v1/workspaces/${workspace.id}/state?environment=default`)
  }
  await page.reload()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
  await showProducts(page)
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await showProducts(page)
}

async function ask(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
}

function agentTab(page: Page, title: string) {
  const exact = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  return page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: exact }).last()
}

function agentView(page: Page, title: string) {
  return page.getByTestId('agent-view').filter({ has: page.getByRole('heading', { level: 2, name: title, exact: true }) }).last()
}

async function closeAgentTab(page: Page, title: string) {
  const exact = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  const tabs = page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: exact })
  const before = await tabs.count()
  const tab = tabs.last()
  await tab.hover()
  await tab.getByRole('button', { name: 'Close tab' }).click()
  await expect(tabs).toHaveCount(before - 1)
}

async function expectTabStartVisible(page: Page, title: string) {
  const tab = agentTab(page, title)
  const strip = tab.locator('xpath=ancestor::div[contains(@class,"pane-tab-list")]')
  const titleText = tab.locator('.pane-tab-open > span').first()
  await expect.poll(async () => {
    const [tabLeft, textLeft, stripLeft] = await Promise.all([
      tab.evaluate((el) => el.getBoundingClientRect().left),
      titleText.evaluate((el) => el.getBoundingClientRect().left),
      strip.evaluate((el) => el.getBoundingClientRect().left),
    ])
    return tabLeft >= stripLeft - 1 && textLeft >= stripLeft - 1
  }).toBe(true)
}

async function shot(page: Page, name: string) {
  const dir = process.env.BRAIAN_AGENT_SHOTS
  if (!dir) return
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/${name}-dark.png` })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/${name}-light.png` })
}

test('background runs show a count and Review results opens the tab', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const alpha = 'hold the run alpha'
  const beta = 'hold the run beta'
  await ask(page, alpha)
  const alphaView = agentView(page, alpha)
  await expect(alphaView.getByTestId('agent-status')).toHaveAttribute('data-status', 'working')
  await alphaView.getByTestId('agent-mode').click()
  await expect(alphaView).toHaveAttribute('data-mode', 'background')
  await ask(page, beta)
  const betaView = agentView(page, beta)
  await betaView.getByTestId('agent-mode').click()
  await expect(betaView).toHaveAttribute('data-mode', 'background')
  await expect(page.getByTestId('agent-background-count')).toHaveText('2')
  await expect(page.getByTestId('agent-background-indicator')).toHaveAttribute('aria-label', '2 agents working')
  await shot(page, 'agent-indicator')
  await page.getByTestId('agent-background-indicator').click()
  await expect(page.getByTestId('agents-table')).toBeVisible()
  const agentsTab = page.locator('.pane-tab[data-view-type="agents"]').last()
  await agentsTab.hover()
  await agentsTab.getByRole('button', { name: 'Close tab' }).click()
  await closeAgentTab(page, alpha)
  await closeAgentTab(page, beta)
  await expect(page.getByTestId('agent-background-indicator')).toBeVisible()
  const review = page.getByRole('button', { name: 'Review results' }).first()
  await expect(review).toBeVisible({ timeout: 30_000 })
  await shot(page, 'agent-notification')
  await review.click()
  await expect(page.locator('.pane-tab[data-view-type="agent"]').first()).toBeVisible()
  await expect(page.getByTestId('agent-view').getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(page.getByTestId('agent-view')).toHaveAttribute('data-mode', 'foreground')
})

test('waiting stops for a decision, survives reload, and resume continues', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'ask me before you continue'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'waiting', { timeout: 30_000 })
  await expect(view.getByTestId('agent-status')).toHaveText('Waiting for you')
  await expect(view.getByTestId('agent-question')).toHaveText('Which value should I use? I will not guess.')
  await view.getByTestId('agent-mode').click()
  await expect(view).toHaveAttribute('data-mode', 'background')
  const waitingToast = page.locator('[data-sonner-toast]').filter({ hasText: 'waiting for you' })
  await expect(waitingToast).toBeVisible({ timeout: 15_000 })
  await expect(waitingToast.getByRole('button', { name: 'Review results' })).toHaveCount(0)
  await expect(waitingToast.getByRole('button', { name: 'Answer' })).toBeVisible()
  await shot(page, 'agent-waiting-toast')
  await page.reload()
  await showProducts(page)
  await agentTab(page, title).click()
  const restored = agentView(page, title)
  await expect(restored.getByTestId('agent-status')).toHaveText('Waiting for you')
  await expect(restored.getByTestId('agent-question')).toContainText('I will not guess')
  await expect(restored).toHaveAttribute('data-mode', 'background')
  await restored.getByTestId('agent-mode').click()
  await expect(restored).toHaveAttribute('data-mode', 'foreground')
  await restored.getByTestId('agent-mode').click()
  await expect(restored).toHaveAttribute('data-mode', 'background')
  const answer = page.locator('[data-sonner-toast]').filter({ hasText: 'waiting for you' }).getByRole('button', { name: 'Answer' })
  await expect(answer).toBeVisible({ timeout: 15_000 })
  await closeAgentTab(page, title)
  await answer.click()
  await expect(agentTab(page, title)).toBeVisible()
  await expect(agentView(page, title).getByTestId('agent-question')).toBeVisible()
  await expect(agentView(page, title)).toHaveAttribute('data-mode', 'foreground')
  const reply = agentView(page, title).getByTestId('agent-follow-up')
  await expect(reply).toBeFocused()
  const resume = agentView(page, title).getByTestId('agent-resume')
  await expect(resume).toBeDisabled()
  await expectTabStartVisible(page, title)
  await shot(page, 'agent-waiting')
  await reply.fill('Use the existing name')
  await expect(resume).toBeEnabled()
  await resume.click()
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await page.reload()
  await showProducts(page)
  await agentTab(page, title).click()
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveAttribute('data-status', 'done')
  await expect(agentView(page, title).getByTestId('agent-question')).toContainText('I will not guess')
})

test('Ctrl+K lists agents and Enter opens the tab', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'ask me before the palette lists it'
  await ask(page, title)
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveAttribute('data-status', 'waiting', { timeout: 30_000 })
  await closeAgentTab(page, title)
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await page.getByTestId('palette-input').fill('Agents')
  await expect(palette.locator('.hit.on')).toContainText('Agents')
  await expect(page.getByTestId('palette-tab-hint')).toHaveText(/Tab\s*open/)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette-crumb')).toContainText('Agents ›')
  await expect(page.getByTestId('palette-input')).toHaveAttribute('placeholder', 'Search agents…')
  await page.getByTestId('palette-input').fill('palette lists')
  await expect(palette.locator('.hit.on')).toContainText(title)
  if (process.env.BRAIAN_AGENT_SHOTS) {
    const dir = process.env.BRAIAN_AGENT_SHOTS
    const theme = (await page.locator('html').getAttribute('data-theme')) === 'light' ? 'light' : 'dark'
    const other = theme === 'dark' ? 'light' : 'dark'
    await page.screenshot({ path: `${dir}/agent-palette-${theme}.png` })
    await page.keyboard.press('Escape')
    await setTheme(page, other)
    await page.keyboard.press('Control+k')
    await page.getByTestId('palette-input').fill('Agents')
    await page.keyboard.press('Enter')
    await page.getByTestId('palette-input').fill('palette lists')
    await expect(page.getByTestId('command-palette').locator('.hit.on')).toContainText(title)
    await page.screenshot({ path: `${dir}/agent-palette-${other}.png` })
  }
  await page.keyboard.press('Enter')
  await expect(palette).toHaveCount(0)
  await expect(agentTab(page, title)).toBeVisible()
  await expect(agentView(page, title).getByTestId('agent-question')).toBeVisible()
})

test('a long active tab keeps its start visible in a crowded strip', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const titles = [
    'ask me before the tab strip shows the whole start',
    'ask me before the neighbor tab stays fully readable',
    'ask me before the active name begins at the left',
  ]
  const tabFor = (prefix: string) => page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: prefix }).last()
  for (const title of titles) {
    await ask(page, title)
    await expect(page.getByTestId('command-palette')).toHaveCount(0)
    await expect(tabFor(title.slice(0, 24))).toBeAttached()
    await expect(page.getByTestId('agent-follow-up').last()).toBeFocused()
  }
  const active = titles[2].slice(0, 24)
  await tabFor(active).click({ force: true })
  const tab = tabFor(active)
  const strip = tab.locator('xpath=ancestor::div[contains(@class,"pane-tab-list")]')
  const pane = tab.locator('xpath=ancestor::section[contains(@class,"pane")]')
  const before = await pane.boundingBox()
  if (before) {
    const dividers = page.locator('.split-divider.horizontal')
    const count = await dividers.count()
    for (let i = 0; i < count; i += 1) {
      const box = await dividers.nth(i).boundingBox()
      if (!box) continue
      const onRight = box.x >= before.x + before.width - 12 && box.x <= before.x + before.width + 16
      if (!onRight) continue
      const y = box.y + Math.min(80, box.height / 2)
      await page.mouse.move(box.x + box.width / 2, y)
      await page.mouse.down()
      await page.mouse.move(before.x + 220, y, { steps: 12 })
      await page.mouse.up()
      break
    }
  }
  try {
  await expect.poll(async () => {
    const [tabLeft, textLeft, stripLeft] = await Promise.all([
      tab.evaluate((el) => el.getBoundingClientRect().left),
      tab.locator('.pane-tab-open > span').first().evaluate((el) => el.getBoundingClientRect().left),
      strip.evaluate((el) => el.getBoundingClientRect().left),
    ])
    return tabLeft >= stripLeft - 1 && textLeft >= stripLeft - 1
  }).toBe(true)
  const [tabLeft, stripLeft, truncated, overflow] = await Promise.all([
    tab.evaluate((el) => el.getBoundingClientRect().left),
    strip.evaluate((el) => el.getBoundingClientRect().left),
    tab.locator('.pane-tab-open > span').first().evaluate((el) => el.scrollWidth > el.clientWidth + 1),
    strip.evaluate((el) => el.scrollWidth > el.clientWidth + 8),
  ])
  expect(overflow).toBe(true)
  expect(tabLeft).toBeLessThanOrEqual(stripLeft + 8)
  expect(truncated).toBe(true)
  const cut = await page.locator('.pane-tab-list').evaluateAll((lists) => lists.flatMap((list) => {
    const view = list.getBoundingClientRect()
    return [...list.querySelectorAll<HTMLElement>('[data-tab]')].flatMap((item) => {
      const box = item.getBoundingClientRect()
      const cutOnLeft = box.left < view.left - 1 && box.right > view.left + 1
      if (!cutOnLeft) return []
      return [item.querySelector('span')?.textContent?.replace(/\s+/g, ' ').trim() ?? '']
    })
  }))
  expect(cut).toEqual([])
  await shot(page, 'agent-tab-strip')
  } finally {
    await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
    const listed = await page.request.get('/v1/workspaces')
    const body = (await listed.json()) as { workspaces: Array<{ id: string; name: string }> }
    const workspace = body.workspaces.find((item) => item.name === 'Products')
    const me = await page.request.get('/v1/me')
    const userId = ((await me.json()) as { user_id?: string }).user_id
    if (userId && workspace) {
      await page.evaluate((key) => localStorage.removeItem(key), `braian.layout.${userId}.default.${workspace.id}`)
      await page.request.delete(`/v1/workspaces/${workspace.id}/state?environment=default`)
    }
  }
})

test('the agents table lists status, proposals and updated time, and Enter opens the tab', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await resetProductsLayout(page)
  const title = 'ask me before the agents table'
  await ask(page, title)
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveAttribute('data-status', 'waiting', { timeout: 30_000 })
  await page.keyboard.press('Control+k')
  await page.getByTestId('palette-input').fill('Agents table')
  await expect(page.getByTestId('command-palette').locator('.hit.on')).toContainText('Agents table')
  await page.keyboard.press('Enter')
  const table = page.getByTestId('agents-table')
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Status' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Proposals' })).toBeVisible()
  await expect(table.getByRole('columnheader', { name: 'Updated' })).toBeVisible()
  const row = table.getByTestId('agent-table-row').filter({ hasText: title }).first()
  await expect(row).toContainText('Waiting')
  await expect(row).toContainText('0')
  await expect(row).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await shot(page, 'agent-agents-table')
  await closeAgentTab(page, title)
  await row.focus()
  await row.press('Enter')
  await expect(agentTab(page, title)).toBeVisible()
  await expect(agentView(page, title).getByTestId('agent-status')).toHaveText('Waiting for you')
})
