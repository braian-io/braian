import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { setTheme } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible({ timeout: 60_000 })
}

async function expectQueryInputHasNoRing(page: Page) {
  const input = page.getByTestId('palette-input')
  await input.focus()
  await expect(input).toBeFocused()
  const inputRing = await input.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    }
  })
  expect(inputRing.outlineStyle).toBe('none')
  expect(inputRing.boxShadow).toBe('none')

  const containerRing = await page.locator('.palette-query').evaluate((el) => getComputedStyle(el).boxShadow)
  expect(containerRing).not.toBe('none')
}

async function expectCloseButtonFocus(page: Page) {
  const close = page.locator('.palette-close')
  await close.focus()
  await expect(close).toBeFocused()
  const styles = await close.evaluate((el) => {
    const style = getComputedStyle(el)
    return {
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
      borderTopWidth: style.borderTopWidth,
    }
  })
  expect(styles.boxShadow).toBe('none')
  expect(styles.borderTopWidth).toBe('0px')
  expect(Number.parseFloat(styles.outlineWidth)).toBeGreaterThan(0)
}

test.describe('palette query focus ring', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`${theme}: root query shows one ring on the container`, async ({ page }) => {
      await login(page)
      await setTheme(page, theme)
      await page.keyboard.press('Control+k')
      await expect(page.getByTestId('command-palette')).toBeVisible()
      await expectQueryInputHasNoRing(page)
    })

    test(`${theme}: Ask AI query shows one ring on the container`, async ({ page }) => {
      await login(page)
      await setTheme(page, theme)
      await page.keyboard.press('Control+j')
      await expect(page.getByTestId('ai-badge')).toBeVisible()
      await expectQueryInputHasNoRing(page)
      await expectCloseButtonFocus(page)
    })
  }
})
