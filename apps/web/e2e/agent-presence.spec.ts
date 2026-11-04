import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

async function showProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first().click()
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
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
  const tab = agentTab(page, title)
  await tab.hover()
  await tab.getByRole('button', { name: 'Close tab' }).click()
  await expect(tab).toHaveCount(0)
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
  await shot(page, 'agent-indicator')
  await closeAgentTab(page, alpha)
  await closeAgentTab(page, beta)
  await expect(page.getByTestId('agent-background-indicator')).toBeVisible()
  const review = page.getByRole('button', { name: 'Review results' }).first()
  await expect(review).toBeVisible({ timeout: 30_000 })
  await shot(page, 'agent-notification')
  await review.click()
  await expect(page.locator('.pane-tab[data-view-type="agent"]')).toBeVisible()
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
  const review = page.locator('[data-sonner-toast]').filter({ hasText: 'waiting for you' }).getByRole('button', { name: 'Review results' })
  await expect(review).toBeVisible({ timeout: 15_000 })
  await closeAgentTab(page, title)
  await review.click()
  await expect(agentTab(page, title)).toBeVisible()
  await expect(agentView(page, title).getByTestId('agent-question')).toBeVisible()
  await expect(agentView(page, title)).toHaveAttribute('data-mode', 'foreground')
  await shot(page, 'agent-waiting')
  await agentView(page, title).getByTestId('agent-follow-up').fill('Use the existing name')
  await agentView(page, title).getByTestId('agent-resume').click()
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

test('the agents table lists status, proposals and updated time, and Enter opens the tab', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
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
  const row = table.getByTestId('agent-table-row').filter({ hasText: title })
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
