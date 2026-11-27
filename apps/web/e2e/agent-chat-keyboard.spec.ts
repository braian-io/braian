// Agent chat keyboard: Ctrl+J toggle, Esc, drafts, Enter/Shift+Enter, send lock.
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
}

async function openAgentAsk(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
}

function agent(page: Page) {
  return page.getByTestId('agent-view').last()
}

async function ensureAgentOpen(page: Page) {
  if ((await agent(page).count()) === 0) {
    await page.keyboard.press('Control+j')
  }
  await expect(agent(page)).toBeVisible({ timeout: 30_000 })
  return agent(page)
}

async function cleanupDrafts(page: Page) {
  await page.getByTestId('discard-draft').first().click({ timeout: 5_000 }).catch(() => undefined)
  const discardAll = page.getByRole('button', { name: 'Discard all' })
  if ((await discardAll.count()) > 0 && (await discardAll.isEnabled())) {
    await discardAll.click({ timeout: 15_000 }).catch(() => undefined)
  }
  await page.keyboard.press('Control+j').catch(() => undefined)
}

test('agent keyboard shortcuts', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const products = mainTable(page, 'Products')
  const row = products.getByTestId('object-row').first()
  await row.click()
  const objectId = ((await row.getAttribute('id')) ?? '').replace('object-row-', '')
  const target = `key name ${Date.now().toString().slice(-5)}`
  const prompt = `byt namn på den här produkten till ${target}`
  try {
    await openAgentAsk(page, prompt)
    const view = agent(page)
    await expect(view).toBeVisible({ timeout: 30_000 })
    await expect(view.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 60_000 })

    const followUp = view.getByTestId('agent-follow-up')
    const draftText = 'draft survives toggle'
    await followUp.fill(draftText)
    await page.keyboard.press('Control+j')
    await expect(view).toHaveCount(0)

    await page.keyboard.press('Control+j')
    await expect(agent(page)).toBeVisible()
    await expect(agent(page).getByTestId('agent-follow-up')).toHaveValue(draftText)

    await products.getByTestId('object-row').first().click()
    await expect(agent(page)).toBeVisible()
    await page.keyboard.press('Control+j')
    await expect(agent(page)).toHaveCount(0)

    await page.keyboard.press('Control+j')
    await expect(agent(page).getByTestId('agent-follow-up')).toHaveValue(draftText)

    const afterLink = agent(page)
    await expect(afterLink.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
    const result = afterLink.getByTestId('agent-result-link').first()
    await expect(result).toBeVisible()
    await result.click()
    await expect(products.locator(`[id="object-row-${objectId}"] [data-column="name"]`)).toContainText(target, { timeout: 30_000 })
    await page.keyboard.press('Control+j')
    await expect(agent(page)).toHaveCount(0)

    const reopened = await ensureAgentOpen(page)
    const input = reopened.getByTestId('agent-follow-up')
    await input.fill('line one')
    await input.press('Shift+Enter')
    await input.type('line two')
    const multiline = await input.inputValue()
    expect(multiline).toContain('line one')
    expect(multiline).toContain('line two')
    expect(multiline.split('\n').length).toBeGreaterThanOrEqual(2)

    await input.press('Escape')
    await expect(input).not.toBeFocused()
    await expect(input).toHaveValue(multiline)

    await input.focus()
    const follow = `follow ${Date.now().toString().slice(-4)}`
    await input.fill(follow)
    await input.press('Enter')
    await expect(reopened.getByTestId('agent-chat-user').filter({ hasText: follow })).toBeVisible({ timeout: 30_000 })
    await expect(input).toHaveValue('')

    const slowPrompt = `follow again ${Date.now().toString().slice(-4)}`
    await input.fill(slowPrompt)
    const send = reopened.getByTestId('agent-send')
    await expect(send).toHaveAccessibleName('Send')
    await expect(send).toHaveText('')
    await input.press('Enter')
    await expect(send).toBeDisabled()
    await expect(reopened.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 60_000 })
    await expect(reopened.getByTestId('agent-chat-user').filter({ hasText: slowPrompt })).toBeVisible()

    await page.keyboard.press('Control+j')
    await expect(agent(page)).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(agent(page).getByTestId('agent-chat-user').filter({ hasText: follow })).toBeVisible()
  } finally {
    await cleanupDrafts(page)
  }
})