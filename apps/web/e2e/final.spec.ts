import { setTheme } from './ui'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { demoCredentials } from './demo'

const shots = '/opt/cursor/artifacts/final'
mkdirSync(shots, { recursive: true })

async function signIn(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-table').first()).toBeVisible()
}

test('final surfaces', async ({ page }) => {
  test.skip(!process.env.BRAIAN_FINAL, 'set BRAIAN_FINAL=1 against the demo server')
  test.setTimeout(180_000)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await page.screenshot({ path: `${shots}/login.png` })
  await signIn(page)

  const workspaces = [
    ['Products', 'object-table'],
    ['Data model', 'data-model'],
    ['Review', 'proposal'],
  ] as const
  for (const [name, testId] of workspaces) {
    await page.locator('nav.tabs').getByRole('button', { name }).click()
    await expect(page.getByTestId(testId).first()).toBeVisible()
    if (name === 'Products') await expect(page.getByTestId('detail-empty')).toBeVisible()
    await page.screenshot({ path: `${shots}/${name.toLowerCase().replaceAll(' ', '-')}-dark.png` })
  }

  await page.locator('nav.tabs').getByRole('button', { name: 'Products' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible()
  await page.getByTestId('object-row').first().click({ button: 'right' })
  await expect(page.getByTestId('context-menu')).toBeVisible()
  await page.screenshot({ path: `${shots}/context-menu.png` })
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await expect(page.getByText('Ask AI', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${shots}/command-palette.png` })
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+k')
  await page.getByTestId('palette-input').fill('hej')
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  await expect(page.getByTestId('agent-view')).toContainText('hej')
  await expect(page.getByTestId('agent')).toHaveCount(0)
  await page.screenshot({ path: `${shots}/command-palette-ai.png` })

  await page.getByTestId('object-row').filter({ hasText: 'ART-' }).first().click()
  await page.getByRole('button', { name: 'Graph' }).click()
  await expect(page.locator('canvas[data-testid=graph]')).toBeVisible()
  await page.screenshot({ path: `${shots}/graph.png` })

  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.getByTestId('history')).toContainText('Created')
  await page.screenshot({ path: `${shots}/history.png` })

  await page.getByRole('button', { name: 'Data model' }).click()
  await expect(page.getByTestId('data-model').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/data-model-workspace.png` })

  await setTheme(page, 'light')
  await page.locator('nav.tabs').getByRole('button', { name: 'Products' }).click()
  await expect(page.getByTestId('object-table').first()).toBeVisible()
  await page.screenshot({ path: `${shots}/enrich-objects-light.png` })
})
