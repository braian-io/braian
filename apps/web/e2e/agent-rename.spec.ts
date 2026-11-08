// Row 171. This spec covers a selected product: the agent files a reviewable
// name proposal, Accept writes the display name, and the products table shows it.
// Finding a product by name, an ambiguous or missing name, read-only access,
// and leaving the key unchanged are covered by
// crates/api/tests/agent_runs.rs (`named_product_rename_proposes_the_display_name_and_leaves_the_key`
// and `rename_fails_safely_when_the_product_is_ambiguous_missing_or_read_only`).
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const products = page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first()
  if (await products.count()) await products.click()
  await expect(mainTable(page, 'Products').getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
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

test('a clear rename becomes a proposal without asking, and Accept changes the name', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const row = mainTable(page, 'Products').getByTestId('object-row').first()
  await expect(row).toBeVisible()
  const objectId = ((await row.getAttribute('id')) ?? '').replace('object-row-', '')
  expect(objectId).not.toBe('')
  await row.click()

  const target = `Test ${Date.now().toString().slice(-5)}`
  const title = `byt namn på den här produkten till ${target}`
  await ask(page, title)
  const view = agentView(page, title)

  await expect(view.getByTestId('agent-proposal')).toHaveCount(0)
  await expect(view.getByTestId('agent-follow-up')).toHaveCount(0)
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(view.getByTestId('agent-status')).not.toHaveText('Waiting for you')
  await expect(view.getByTestId('agent-question')).toHaveCount(0)
  await expect(view.getByRole('button', { name: 'Run in background' })).toBeVisible()
  await expect(view.getByTestId('agent-mode')).toHaveAttribute('aria-label', 'Run in background')
  await view.getByTestId('agent-open-draft').click()
  const renamed = mainTable(page, 'Products').locator(`[id="object-row-${objectId}"] [data-column="name"]`)
  await expect(renamed).toContainText(target, { timeout: 30_000 })
  await page.getByTestId('review-and-save').first().click()
  // Accept is an async write. Wait for the proposal diff to clear before the GET.
  await expect(renamed).not.toContainText('→', { timeout: 30_000 })

  const after = await page.request.get(`/v1/objects/${objectId}`)
  expect(after.ok()).toBeTruthy()
  const saved = (await after.json()) as { values?: { name?: Record<string, string>; number?: string; sku?: string } }
  expect(Object.values(saved.values?.name ?? {})).toContain(target)
  const identifier = saved.values?.number ?? saved.values?.sku
  if (identifier) expect(identifier).not.toBe(target)

  // The agent opens as the active tab in this pane, so the products table
  // unmounts. Show it again and read the renamed object's name cell.
  await page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first().click()
  const shown = mainTable(page, 'Products').locator(`[id="object-row-${objectId}"]`)
  await expect(shown).toBeVisible({ timeout: 15_000 })
  await expect(shown.locator('[data-column="name"]')).toContainText(target, { timeout: 15_000 })
})
