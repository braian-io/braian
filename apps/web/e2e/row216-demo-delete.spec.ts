import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

// Post-merge demo proof for row 216. Deliberately not registered in
// scripts/e2e.mjs: it writes to whatever server baseURL points at, so only an
// operator may run it against https://demo.braian.io after merge.
async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

test('demo: create, delete and restore a product with its links', async ({ page }, testInfo) => {
  test.setTimeout(180_000)
  const number = `DEMO216-${Date.now().toString().slice(-7)}`
  await login(page)
  const created = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const object = await created.json() as { id: string }

  try {
    await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
    const filter = page.getByTestId('object-table').getByTestId('quick-filter').first()
    await filter.fill(number)
    const row = page.locator(`#object-row-${object.id}`)
    await expect(row).toBeVisible()
    await row.click({ button: 'right' })
    await page.getByTestId('context-menu').getByRole('menuitem', { name: /^Delete/ }).click()
    const dialog = page.getByTestId('delete-object-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('delete-object-counts')).toContainText('Removes 1 objects')
    await page.screenshot({ path: testInfo.outputPath('demo-delete-dialog.png') })
    await dialog.getByTestId('confirm-delete-object').click()
    await expect(dialog).toBeHidden()
    await expect(row).toHaveCount(0)

    await page.getByTestId('user-menu').click()
    await page.getByTestId('user-menu-trash').click()
    const trash = page.getByTestId('trash-dialog')
    const item = trash.locator('li').filter({ hasText: number }).first()
    await expect(item).toBeVisible()
    await item.getByRole('button', { name: 'Restore' }).click()
    await expect(item).toHaveCount(0)
    await expect.poll(async () => (await page.request.get(`/v1/objects/${object.id}`)).status()).toBe(200)
    await page.screenshot({ path: testInfo.outputPath('demo-delete-restored.png') })
  } finally {
    await page.request.delete(`/v1/objects/${object.id}`).catch(() => undefined)
  }
})
