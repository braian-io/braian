import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function ask(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
}

function agentTab(page: Page, title: string) {
  return page.locator('.pane-tab[data-view-type="agent"]').filter({ hasText: title })
}

function agentView(page: Page, title: string) {
  return page.getByTestId('agent-view').filter({ hasText: title })
}

test('the agent tab opens and the rest of the app stays usable', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'hold the run and describe the catalog'
  await ask(page, title)
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  const tab = agentTab(page, title)
  await expect(tab).toBeVisible()
  const view = agentView(page, title)
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'working')
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await page.getByTestId('object-row').first().click()
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await tab.click()
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(view.getByTestId('agent-answer').first()).toBeVisible()
})

test('the agent tab and its reply survive a reload', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'how many products are in this workspace'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view).toContainText(title)
  await expect(view.getByTestId('agent-answer')).toContainText("AI isn't set up for this workspace", { timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
  const tab = agentTab(page, title)
  await expect(tab).toBeVisible()
  await tab.click()
  await expect(agentView(page, title)).toContainText(title)
  await expect(agentView(page, title).getByTestId('agent-answer')).toContainText("AI isn't set up for this workspace")
})

test('a user edit marks the agent proposal stale', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const row = mainTable(page).getByTestId('object-row').first()
  await row.click()
  const original = ((await row.locator('[data-column="name"]').first().textContent()) ?? '').trim()
  expect(original.length).toBeGreaterThan(0)
  const title = 'propose a new name'
  await ask(page, title)
  const view = agentView(page, title)
  const proposal = view.getByTestId('agent-proposal')
  await expect(proposal).toBeVisible({ timeout: 30_000 })
  await expect(proposal).toHaveAttribute('data-stale', 'false')
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  const edited = `${original} edited`
  const nameCell = row.locator('[data-column="name"]').first()
  await nameCell.dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill(edited)
  await editor.press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
  await agentTab(page, title).click()
  await expect(view.getByTestId('agent-proposal-stale')).toBeVisible({ timeout: 30_000 })
  await expect(view.getByTestId('agent-notice')).toBeVisible()
  await expect(view.getByTestId('approve-proposal')).toBeDisabled()
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await nameCell.dblclick()
  await page.getByTestId('cell-editor-name').fill(original)
  await page.getByTestId('cell-editor-name').press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
})

test('screenshots of the agent tab in dark and light', async ({ page }) => {
  test.skip(!process.env.BRAIAN_AGENT_SHOTS, 'set BRAIAN_AGENT_SHOTS to a directory')
  test.setTimeout(120_000)
  const dir = process.env.BRAIAN_AGENT_SHOTS ?? ''
  await login(page)
  await page.getByTestId('object-row').first().click()
  await ask(page, 'propose a new name for the selected product')
  const view = agentView(page, 'propose a new name for the selected product')
  await expect(view).toBeVisible()
  await expect(view.getByTestId('agent-proposal')).toBeVisible({ timeout: 30_000 })
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/agent-tab-dark.png`, fullPage: true })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/agent-tab-light.png`, fullPage: true })
})
