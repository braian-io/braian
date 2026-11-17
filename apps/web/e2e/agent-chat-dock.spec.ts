// Docked agent chat: right pane, follow-ups, and Products stays open.
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

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

function paneWithTable(page: Page) {
  return paneWithTab(page, 'Products')
}

function paneWithDetail(page: Page) {
  return page.locator('section.pane').filter({ has: page.getByTestId('object-detail') })
}

function paneWithAgent(page: Page) {
  return page.locator('section.pane').filter({ has: page.getByTestId('agent-view') })
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
  const productsPane = paneWithTable(page)
  const detailPane = paneWithDetail(page)
  await expect(detailPane).toBeVisible()
  await page.locator('.pane-tab[data-view-type="object_table"]').filter({ hasText: /^Products/ }).first().click()

  const layoutBefore = await Promise.all([productsPane.boundingBox(), detailPane.boundingBox()])
  expect(layoutBefore[0] && layoutBefore[1], 'products and detail panes need layout boxes').toBeTruthy()
  const [productsBefore, detailBefore] = layoutBefore as [NonNullable<Awaited<ReturnType<typeof productsPane.boundingBox>>>, NonNullable<Awaited<ReturnType<typeof detailPane.boundingBox>>>]
  const stacked = Math.abs(productsBefore.x - detailBefore.x) < 8
  if (stacked) expect(productsBefore.y).toBeLessThanOrEqual(detailBefore.y + 2)
  else expect(productsBefore.x).toBeLessThan(detailBefore.x + 4)

  await openAgentAsk(page, prompt)
  const agent = agentPane(page)
  await expect(agent).toBeVisible({ timeout: 30_000 })
  await expect(products).toBeVisible()
  await expect(page.getByTestId('object-detail')).toBeVisible()

  const [productsAfter, detailAfter, agentBox] = await Promise.all([
    productsPane.boundingBox(),
    detailPane.boundingBox(),
    paneWithAgent(page).boundingBox(),
  ])
  expect(productsAfter && detailAfter && agentBox, 'all three panes need layout boxes').toBeTruthy()
  if (stacked) expect(productsAfter!.y).toBeLessThanOrEqual(detailAfter!.y + 2)
  else expect(productsAfter!.x).toBeLessThan(detailAfter!.x + 4)
  const rightEdge = Math.max(productsAfter!.x, detailAfter!.x)
  expect(agentBox!.x).toBeGreaterThan(rightEdge + 40)
  expect(Math.abs((productsAfter!.x - productsBefore.x))).toBeLessThan(4)
  expect(Math.abs((detailAfter!.x - detailBefore.x))).toBeLessThan(4)
  await expect(agent.getByTestId('agent-follow-up')).toBeFocused()
  await expect(agent.getByTestId('agent-chat-user')).toContainText(prompt)
  await expect(agent.getByTestId('agent-status')).toHaveAttribute('data-status', 'done', { timeout: 30_000 })
  await expect(agent.getByTestId('agent-answer').first()).toContainText(/Waiting for Save|proposed/i)
  const objectId = ((await row.getAttribute('id')) ?? '').replace('object-row-', '')
  try {
    const result = agent.getByTestId('agent-result-link').first()
    await expect(result).toBeVisible()
    await result.click({ timeout: 15_000 })
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