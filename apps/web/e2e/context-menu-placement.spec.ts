import { expect, test, type Page } from @playwright/test
import { demoCredentials } from ./demo
import { mainTable } from ./ui

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto(/)
  await page.getByTestId(email).fill(demo.email)
  await page.getByTestId(password).fill(demo.password)
  await page.getByRole(button, { name: Sign in }).click()
  await expect(page.getByTestId(workspace)).toBeVisible()
}

test(row context menu opens under the clicked row, async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await page.locator(nav.tabs).getByRole(button, { name: /^Products/ }).click()
  const table = mainTable(page, Products)
  const row = table.getByTestId(object-row).first()
  await expect(row).toBeVisible()
  const rowBox = await row.boundingBox()
  expect(rowBox).toBeTruthy()
  await row.click({ button: right })
  const menu = page.getByTestId(context-menu)
  await expect(menu).toBeVisible()
  const menuBox = await menu.boundingBox()
  expect(menuBox).toBeTruthy()
  // Menu starts at or below the row bottom so Status/Version stay readable (H6).
  expect(menuBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height - 1)
  await page.keyboard.press(Escape)
  await expect(menu).toHaveCount(0)
})
