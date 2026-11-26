// Agent focus returns to the opener on close, and to a pane when there is no left pane.
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

function focusSnapshot(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement
    const marked = document.querySelector('[data-focus-restore="before"]')
    const onPane = active instanceof Element && (active.matches('section.pane') || Boolean(active.closest('section.pane')))
    return {
      body: active === document.body || active === document.documentElement,
      testId: active instanceof Element ? active.getAttribute('data-testid') ?? '' : '',
      role: active instanceof Element ? active.getAttribute('role') ?? '' : '',
      pane: active instanceof Element ? active.closest('section.pane')?.getAttribute('data-pane') ?? '' : '',
      restored: Boolean(marked && active === marked),
      markedConnected: Boolean(marked?.isConnected),
      onPane,
    }
  })
}

async function openAgent(page: Page) {
  const prompt = `focus check ${Date.now().toString().slice(-5)}`
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await expect(page.getByTestId('agent-view').last()).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('agent-follow-up')
}

async function closeNonAgentTabs(page: Page) {
  for (let guard = 0; guard < 12; guard += 1) {
    const tab = page.locator('.pane-tab:not([data-view-type="agent"])').first()
    if ((await tab.count()) === 0) return
    const id = await tab.getAttribute('data-tab')
    if (!id) throw new Error('tab is missing an id')
    await tab.hover()
    await page.getByTestId(`close-tab-${id}`).click()
    await expect(page.locator(`.pane-tab[data-tab="${id}"]`)).toHaveCount(0)
  }
  throw new Error('non-agent tabs remained')
}

test('closing the agent restores the element that had focus', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const products = mainTable(page, 'Products')
  const row = products.getByTestId('object-row').first()
  await row.click()
  await page.evaluate(() => {
    document.querySelectorAll('[data-focus-restore]').forEach((node) => node.removeAttribute('data-focus-restore'))
    document.activeElement?.setAttribute('data-focus-restore', 'before')
  })
  const before = await focusSnapshot(page)
  expect(before.body).toBe(false)
  expect(before.restored).toBe(true)
  expect(before.role).toBe('grid')
  expect(before.pane).not.toBe('')
  try {
    await openAgent(page)
    const opened = await focusSnapshot(page)
    expect(opened.testId).toBe('agent-follow-up')
    expect(opened.body).toBe(false)
    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view')).toHaveCount(0)
    await expect.poll(async () => (await focusSnapshot(page)).body).toBe(false)
    const after = await focusSnapshot(page)
    expect(after.body).toBe(false)
    expect(after.role).toBe(before.role)
    expect(after.pane).toBe(before.pane)
    expect(after.testId).toBe(before.testId)
    if (after.markedConnected) {
      expect(after.restored, 'focus returns to the same element when it is still mounted').toBe(true)
    }
  } finally {
    await page.keyboard.press('Control+j').catch(() => undefined)
  }
})

test('without a left pane, closing or releasing the agent focuses a pane', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page)
  const products = mainTable(page, 'Products')
  await products.getByTestId('object-row').first().click()
  await page.evaluate(() => {
    document.activeElement?.setAttribute('data-focus-restore', 'before')
  })
  try {
    await openAgent(page)
    await closeNonAgentTabs(page)
    await expect(page.locator('.pane-tab:not([data-view-type="agent"])')).toHaveCount(0)
    const hasLeft = await page.evaluate(() => {
      const agent = document.querySelector('[data-testid="agent-view"]')?.closest('section.pane')
      if (!agent) return true
      const box = agent.getBoundingClientRect()
      return [...document.querySelectorAll('section.pane')].some((pane) => {
        if (pane === agent) return false
        return pane.getBoundingClientRect().right <= box.left + 1
      })
    })
    expect(hasLeft, 'this case has no pane to the left of the agent').toBe(false)
    await page.getByTestId('agent-follow-up').focus()
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await focusSnapshot(page)).body).toBe(false)
    const released = await focusSnapshot(page)
    expect(released.testId).not.toBe('agent-follow-up')
    expect(released.onPane).toBe(true)
    await page.keyboard.press('Control+j')
    await expect(page.getByTestId('agent-view')).toHaveCount(0)
    await expect.poll(async () => (await focusSnapshot(page)).body).toBe(false)
    const closed = await focusSnapshot(page)
    expect(closed.markedConnected).toBe(false)
    expect(closed.onPane).toBe(true)
  } finally {
    await page.keyboard.press('Control+j').catch(() => undefined)
  }
})
