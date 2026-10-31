import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(page.getByTestId('object-table')).toBeVisible()
}

test.describe('palette Home/End and first key', () => {
  test('Home then a character inserts at the start; End then a character appends', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    await page.keyboard.press('Control+k')
    const input = page.getByTestId('palette-input')
    await expect(input).toBeVisible()
    await input.fill('abc')
    await expect(input).toHaveValue('abc')

    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length))
    await input.press('Home')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0)
    await page.keyboard.type('X')
    await expect(input).toHaveValue('Xabc')

    await input.evaluate((el: HTMLInputElement) => el.setSelectionRange(el.value.length, el.value.length))
    await input.press('End')
    expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(4)
    await page.keyboard.type('Y')
    await expect(input).toHaveValue('XabcY')

    // Shift+Home selects back to start (browser selection, not list jump).
    await input.press('Shift+Home')
    const selected = await input.evaluate((el: HTMLInputElement) =>
      el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0),
    )
    expect(selected).toBe('XabcY')
  })

  test('Ctrl+K then immediate type keeps every character (no wait)', async ({ page }) => {
    test.setTimeout(120_000)
    await login(page)
    await openProducts(page)
    await expect(page.getByText('Mature cheddar')).toBeVisible({ timeout: 60_000 })

    // Regression for #120: type in the same turn as opening, with zero delay.
    for (let round = 0; round < 5; round += 1) {
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('command-palette')).toHaveCount(0)
      await page.getByTestId('object-table').focus()
      await page.keyboard.press('Control+k')
      // Intentionally no expect/wait — first glyph must not drop under automation.
      await page.keyboard.type('Select fields', { delay: 0 })
      await expect(page.getByTestId('palette-input')).toHaveValue('Select fields')
      await page.keyboard.press('Escape')
    }
  })
})
