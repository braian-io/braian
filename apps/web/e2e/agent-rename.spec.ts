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

  const proposal = view.getByTestId('agent-proposal')
  await expect(proposal).toBeVisible({ timeout: 30_000 })
  await expect(proposal).toContainText(target)
  await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(view.getByTestId('agent-status')).not.toHaveText('Waiting for you')
  await expect(view.getByTestId('agent-question')).toHaveCount(0)

  // Icon actions: aria-label must stay discoverable (Show session only when a
  // hidden own session exists — covered in agent-session.spec).
  await expect(view.getByRole('button', { name: 'Run in background' })).toBeVisible()
  await expect(view.getByRole('button', { name: 'Send' })).toBeVisible()
  await expect(view.getByTestId('agent-mode')).toHaveAttribute('aria-label', 'Run in background')
  await expect(view.getByTestId('agent-send')).toHaveAttribute('aria-label', 'Send')

  await view.getByTestId('approve-proposal').click()
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Applied' })).toBeVisible({ timeout: 15_000 })

  const after = await page.request.get(`/v1/objects/${objectId}`)
  expect(after.ok()).toBeTruthy()
  const saved = (await after.json()) as { values?: { name?: Record<string, string> } }
  expect(Object.values(saved.values?.name ?? {})).toContain(target)
})
