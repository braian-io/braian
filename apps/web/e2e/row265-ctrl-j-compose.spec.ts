// Row 265: Ctrl+J opens a fresh compose thread, not the last session with messages.
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

function agent(page: Page) {
  return page.getByTestId('agent-view').last()
}

async function openAgentWithPrompt(page: Page, prompt: string) {
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await expect(agent(page)).toBeVisible({ timeout: 30_000 })
}

async function cleanupDrafts(page: Page) {
  await page.getByTestId('discard-draft').first().click({ timeout: 5_000 }).catch(() => undefined)
  const discardAll = page.getByRole('button', { name: 'Discard all' })
  if ((await discardAll.count()) > 0 && (await discardAll.isEnabled())) {
    await discardAll.click({ timeout: 15_000 }).catch(() => undefined)
  }
  await page.keyboard.press('Control+j').catch(() => undefined)
}

test('Ctrl+J opens empty compose after a session with messages', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const products = mainTable(page, 'Products')
  await products.getByTestId('object-row').first().click()
  const marker = `row265-${Date.now().toString().slice(-5)}`
  const prompt = `säg bara hej ${marker}`
  try {
    await openAgentWithPrompt(page, prompt)
    const session = agent(page)
    await expect(session.getByTestId('agent-chat-user').filter({ hasText: marker })).toBeVisible({ timeout: 60_000 })
    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view')).toHaveCount(0)

    await page.keyboard.press('Control+j')
    const compose = agent(page)
    await expect(compose).toBeVisible({ timeout: 30_000 })
    await expect(compose.getByTestId('agent-chat-user').filter({ hasText: marker })).toHaveCount(0)
    await expect(compose.getByTestId('agent-follow-up')).toBeFocused()
  } finally {
    await cleanupDrafts(page)
  }
})

test('Ctrl+J opens empty compose after reload', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const products = mainTable(page, 'Products')
  await products.getByTestId('object-row').first().click()
  const marker = `row265-reload-${Date.now().toString().slice(-5)}`
  const prompt = `säg bara hej ${marker}`
  try {
    await openAgentWithPrompt(page, prompt)
    await expect(agent(page).getByTestId('agent-chat-user').filter({ hasText: marker })).toBeVisible({ timeout: 60_000 })
    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view')).toHaveCount(0)
    await page.reload()
    await expect(page.locator('nav.tabs')).toBeVisible({ timeout: 60_000 })
    await expect(mainTable(page, 'Products').getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })

    await page.keyboard.press('Control+j')
    const compose = agent(page)
    await expect(compose).toBeVisible({ timeout: 30_000 })
    await expect(compose.getByTestId('agent-chat-user').filter({ hasText: marker })).toHaveCount(0)
    await expect(compose.getByTestId('agent-follow-up')).toBeFocused()
  } finally {
    await cleanupDrafts(page)
  }
})