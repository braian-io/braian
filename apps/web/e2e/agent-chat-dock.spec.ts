// Docked agent chat: right pane, follow-ups, and Products stays open.
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

async function openAgentAsk(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
}

function agentPane(page: Page) {
  return page.getByTestId('agent-view').last()
}

test('Ctrl+J opens a right agent chat while Products stays visible', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const products = mainTable(page, 'Products')
  await expect(products).toBeVisible()
  const row = products.getByTestId('object-row').first()
  await row.click()
  const firstTarget = `cola 440 ${Date.now().toString().slice(-4)}`
  const prompt = `byt namn på den här produkten till ${firstTarget}`
  await openAgentAsk(page, prompt)
  const agent = agentPane(page)
  await expect(agent).toBeVisible({ timeout: 30_000 })
  await expect(products).toBeVisible()
  await expect(agent.getByTestId('agent-follow-up')).toBeFocused()
  await expect(agent.getByTestId('agent-chat-user')).toContainText(prompt)
  await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(agent.getByTestId('agent-answer').first()).toContainText(/Waiting for Save|proposed/i)
  const objectId = ((await row.getAttribute('id')) ?? '').replace('object-row-', '')
  try {
    await agent.getByTestId('agent-result-link').first().click()
    await expect(products.locator(`[id="object-row-${objectId}"] [data-column="name"]`)).toContainText(firstTarget, { timeout: 30_000 })
    const secondTarget = `cola 330 ${Date.now().toString().slice(-4)}`
    await agent.getByTestId('agent-follow-up').fill(`byt namn till ${secondTarget}`)
    await agent.getByTestId('agent-send').click()
    await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
    await expect(agent.getByTestId('agent-chat-user').filter({ hasText: secondTarget })).toBeVisible()
    await expect(agent.getByTestId('agent-send')).toBeDisabled()
    await page.keyboard.press('Control+j')
    await expect(agent).toHaveCount(0)
    await expect(products).toBeVisible()
    await page.keyboard.press('Control+j')
    await expect(agentPane(page)).toBeVisible()
    await expect(agentPane(page).getByTestId('agent-chat-user').filter({ hasText: prompt })).toBeVisible()
    await page.getByTestId('discard-draft').first().click({ timeout: 5_000 }).catch(() => undefined)
  } finally {
    await page.getByTestId('discard-draft').first().click({ timeout: 5_000 }).catch(() => undefined)
    const discardAll = page.getByRole('button', { name: 'Discard all' })
    if (await discardAll.isEnabled().catch(() => false)) await discardAll.click()
  }
})