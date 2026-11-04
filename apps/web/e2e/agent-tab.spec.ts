import { expect, test, type Locator, type Page } from '@playwright/test'
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

async function displayedName(cell: Locator): Promise<string> {
  const full = ((await cell.innerText()) ?? '').replace(/\s+/g, ' ').trim()
  const badge = cell.getByTestId('suggestion-count')
  if (await badge.count()) {
    const extra = ((await badge.innerText()) ?? '').replace(/\s+/g, ' ').trim()
    return full.replace(extra, '').trim()
  }
  return full
}

/** The mock proposes "Agent draft". A previous accept leaves that name in place, which hides the diff. */
async function ensureDistinctName(page: Page, row: Locator): Promise<string> {
  const cell = row.locator('[data-column="name"]').first()
  const current = await displayedName(cell)
  if (current !== 'Agent draft') return current
  await cell.dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill('Mature cheddar')
  await editor.press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
  await expect(cell).toContainText('Mature cheddar')
  return 'Mature cheddar'
}

async function ask(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
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
  await showProducts(page)
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
  const original = await ensureDistinctName(page, row)
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
  await expect(view.getByTestId('agent-notice')).toHaveCount(0)
  const reason = view.getByTestId('agent-stale-reason')
  await expect(reason).toContainText(edited)
  await expect(reason).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await expect(view.getByTestId('approve-proposal')).toBeDisabled()
  await view.getByTestId('agent-redo').click()
  await expect(view.getByTestId('agent-follow-up')).toHaveValue('The proposal is stale. Please redo it.')
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await nameCell.dblclick()
  await page.getByTestId('cell-editor-name').fill(original)
  await page.getByTestId('cell-editor-name').press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
})

test('the proposal card shows the object and the field diff', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const row = mainTable(page).getByTestId('object-row').first()
  await row.click()
  const original = await ensureDistinctName(page, row)
  const title = 'propose a new name on this card'
  await ask(page, title)
  const proposal = agentView(page, title).getByTestId('agent-proposal')
  await expect(proposal).toBeVisible({ timeout: 30_000 })
  await expect(proposal.getByTestId('agent-proposal-object')).toContainText(original)
  await expect(proposal.getByTestId('agent-proposal-key')).not.toHaveText('')
  const diff = proposal.getByTestId('field-diff')
  await expect(diff).toContainText('Name')
  await expect(diff).toContainText(original)
  await expect(diff).toContainText('Agent draft')
  await expect(proposal.getByTestId('lang-chip')).toHaveText('en')
  await expect(proposal.getByTestId('approve-proposal')).toBeFocused()
})

test('approving toasts the change, records who approved it, and undo restores the name', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const row = mainTable(page).getByTestId('object-row').first()
  await row.click()
  const original = await ensureDistinctName(page, row)
  const title = 'propose a new name for approve'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view.getByTestId('approve-proposal')).toBeEnabled({ timeout: 30_000 })
  await view.getByTestId('approve-proposal').click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Applied' })
  await expect(toast).toContainText('Name')
  await expect(toast).toContainText('Agent draft')
  await expect(view.getByTestId('agent-resolved')).toContainText('Approved by you')
  await expect(view.getByTestId('agent-resolved')).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await expect(view.getByTestId('agent-follow-up')).toBeFocused()
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(view.getByTestId('agent-resolved')).toContainText('Reverted')
  await expect(view.getByTestId('agent-resolved')).not.toContainText('Approved by you')
  await page.reload()
  await expect(agentView(page, title).getByTestId('agent-resolved')).toContainText('Reverted')
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await expect(row.locator('[data-column="name"]').first()).toContainText(original, { timeout: 30_000 })
})

test('undo after a later edit does not overwrite the name', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const row = mainTable(page).getByTestId('object-row').first()
  await row.click()
  const original = await ensureDistinctName(page, row)
  const title = 'propose a new name before a later edit'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view.getByTestId('approve-proposal')).toBeEnabled({ timeout: 30_000 })
  await view.getByTestId('approve-proposal').click()
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Applied' })
  await expect(toast).toBeVisible()
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  const later = `${original} later`
  const nameCell = row.locator('[data-column="name"]').first()
  await nameCell.dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill(later)
  await editor.press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
  await agentTab(page, title).click()
  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: "Can't undo" })).toBeVisible()
  await expect(view.getByTestId('agent-resolved')).toContainText('Approved by you')
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await expect(nameCell).toContainText(later)
  await nameCell.dblclick()
  await page.getByTestId('cell-editor-name').fill(original)
  await page.getByTestId('cell-editor-name').press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
})

test('rejecting toasts the field and leaves the name unchanged', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const row = mainTable(page).getByTestId('object-row').nth(1)
  await row.click()
  const original = await displayedName(row.locator('[data-column="name"]').first())
  const title = 'propose a new name for reject'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view.getByTestId('reject-proposal')).toBeEnabled({ timeout: 30_000 })
  await view.getByTestId('reject-proposal').click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Rejected' })).toContainText('Agent draft')
  await expect(view.getByTestId('agent-resolved')).toContainText('Rejected by you')
  await expect(view.getByTestId('agent-resolved')).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await expect(row.locator('[data-column="name"]').first()).toContainText(original)
})

test('a failed fetch can be retried and a missing run cannot', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  let failed = false
  await page.route(/\/v1\/agent\/runs\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() === 'GET' && !failed) {
      failed = true
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'the store is busy' }),
      })
      return
    }
    await route.continue()
  })
  await ask(page, 'hold the run briefly')
  const busy = page.getByTestId('agent-fetch-error')
  await expect(busy).toContainText('the store is busy')
  await busy.getByTestId('agent-retry').click()
  await expect(agentView(page, 'hold the run briefly').getByTestId('agent-status')).toBeVisible({ timeout: 30_000 })
  await page.unroute(/\/v1\/agent\/runs\/[0-9a-f-]{36}$/)
  await page.route(/\/v1\/agent\/runs\/[0-9a-f-]{36}$/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'agent run' }),
      })
      return
    }
    await route.continue()
  })
  await ask(page, 'hold the run missing')
  await expect(page.getByTestId('agent-missing').first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('agent-retry')).toHaveCount(0)
})

test('a failed run shows a cleaned error and try again', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'fail this run'
  await ask(page, title)
  const view = agentView(page, title)
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'failed', { timeout: 30_000 })
  const failure = view.getByTestId('agent-run-error')
  await expect(failure).toContainText('The model request failed. Try again, or check the AI settings.')
  await expect(failure).not.toContainText('openai')
  await expect(failure).not.toContainText('status 500')
  await failure.getByTestId('agent-try-again').click()
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'working')
})

test('escape inside the agent tab does not close it', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const title = 'how many products stay open'
  await ask(page, title)
  const tab = agentTab(page, title)
  await expect(tab).toBeVisible()
  const follow = agentView(page, title).getByTestId('agent-follow-up')
  await expect(follow).toBeVisible({ timeout: 30_000 })
  await follow.focus()
  await page.keyboard.press('Escape')
  await expect(tab).toBeVisible()
  await expect(agentView(page, title)).toBeVisible()
})

test('an agent tab in another workspace is announced', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.route('**/v1/agent/runs', async (route) => {
    const url = new URL(route.request().url())
    if (route.request().method() !== 'GET' || url.pathname !== '/v1/agent/runs') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    const body = (await response.json()) as { runs: Array<Record<string, unknown>> }
    body.runs.push({
      id: '018f2000-0000-7000-8000-0000000000aa',
      title: 'agent in another workspace',
      status: 'done',
      mode: 'foreground',
      session_kind: 'own',
      hidden: false,
      tab_open: true,
      workspace_id: '018f2000-0000-7000-8000-000000009999',
      created_at: '2026-11-04T18:00:00Z',
      updated_at: '2026-11-04T18:00:00Z',
    })
    await route.fulfill({ response, json: body })
  })
  await page.reload()
  await expect(page.locator('[data-sonner-toast]')).toContainText('another workspace', { timeout: 60_000 })
  await expect(page.locator('.pane-tab', { hasText: 'agent in another workspace' })).toHaveCount(0)
})

test('screenshots of the agent tab in dark and light', async ({ page }) => {
  test.skip(!process.env.BRAIAN_AGENT_SHOTS, 'set BRAIAN_AGENT_SHOTS to a directory')
  test.setTimeout(240_000)
  const dir = process.env.BRAIAN_AGENT_SHOTS ?? ''
  let releaseSkeleton = () => {}
  const gate = new Promise<void>((resolve) => {
    releaseSkeleton = resolve
  })
  const seen = new Set<string>()
  let arm = false
  await page.route(/\/v1\/agent\/runs\/[0-9a-f-]{36}$/, async (route) => {
    const id = route.request().url().match(/runs\/([0-9a-f-]{36})$/)?.[1] ?? ''
    if (route.request().method() === 'GET' && id) {
      if (!arm) seen.add(id)
      else if (!seen.has(id)) {
        seen.add(id)
        await gate
      }
    }
    await route.continue()
  })
  await login(page)
  arm = true
  const row = mainTable(page).getByTestId('object-row').first()
  await row.click()
  const original = await ensureDistinctName(page, row)
  await ask(page, 'propose a new name for the selected product')
  await expect(page.getByTestId('agent-skeleton')).toBeVisible()
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/agent-skeleton-dark.png`, fullPage: true })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/agent-skeleton-light.png`, fullPage: true })
  releaseSkeleton()
  const view = agentView(page, 'propose a new name for the selected product')
  await expect(view.getByTestId('field-diff')).toContainText('Agent draft', { timeout: 30_000 })
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/agent-diff-dark.png`, fullPage: true })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/agent-diff-light.png`, fullPage: true })
  await view.getByTestId('approve-proposal').click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Applied' })).toBeVisible()
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/agent-approved-dark.png`, fullPage: true })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/agent-approved-light.png`, fullPage: true })
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click()
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await expect(row.locator('[data-column="name"]').first()).toContainText(original, { timeout: 30_000 })
  const staleTitle = 'propose a new name after the edit'
  await ask(page, staleTitle)
  const stale = agentView(page, staleTitle)
  await expect(stale.getByTestId('agent-proposal')).toBeVisible({ timeout: 30_000 })
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  const nameCell = row.locator('[data-column="name"]').first()
  await nameCell.dblclick()
  await page.getByTestId('cell-editor-name').fill(`${original} edited`)
  await page.getByTestId('cell-editor-name').press('Enter')
  await agentTab(page, staleTitle).click()
  await expect(stale.getByTestId('agent-proposal-stale')).toBeVisible({ timeout: 30_000 })
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/agent-stale-dark.png`, fullPage: true })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/agent-stale-light.png`, fullPage: true })
  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await nameCell.dblclick()
  await page.getByTestId('cell-editor-name').fill(original)
  await page.getByTestId('cell-editor-name').press('Enter')
  await ask(page, 'fail this run now')
  const failed = agentView(page, 'fail this run now')
  await expect(failed.getByTestId('agent-run-error')).toBeVisible({ timeout: 30_000 })
  await setTheme(page, 'dark')
  await page.screenshot({ path: `${dir}/agent-failed-dark.png`, fullPage: true })
  await setTheme(page, 'light')
  await page.screenshot({ path: `${dir}/agent-failed-light.png`, fullPage: true })
})
