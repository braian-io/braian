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

test('catalog chip matches the pane chrome and lists source catalogs', async ({ page }) => {
  await login(page)
  const chip = page.locator('.pane.focused').getByTestId('catalog-chip')
  await expect(chip).toBeVisible()
  await expect(chip).toHaveAttribute('data-kind', 'master')
  await chip.click()
  await expect(page.getByRole('option', { name: 'SAP ERP' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Master catalog' })).toBeVisible()
  await page.screenshot({ path: 'test-results/catalog-chip.png' })
})

test('sources workspace, merge profile and a locked brand', async ({ page }) => {
  await login(page)
  await page.getByRole('button', { name: 'Sources' }).click()
  await expect(page.getByTestId('catalogs-view')).toContainText('SAP ERP')
  await expect(page.getByTestId('catalogs-view')).toContainText('Supplier Nordic')
  await expect(page.getByTestId('merge-profiles-view')).toContainText('SAP brand')
  await expect(page.getByTestId('ownership-view')).toBeVisible()
  await expect(page.getByTestId('merge-runs-view')).toHaveCount(0)

  await page.getByRole('button', { name: 'Merge runs' }).click()
  await expect(page.getByTestId('merge-runs-view')).toBeVisible()

  await page.locator('nav.tabs').getByRole('button', { name: /Products/ }).click()
  const row = page.getByTestId('object-row').filter({ hasText: 'PROD-OAT' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByTestId('locked-field')).toContainText('Owned by sap-brand')
  await expect(page.getByTestId('field-origin')).toContainText('PROD-OAT')
  const brand = page.getByTestId('locked-field').locator('input')
  await expect(brand).toHaveValue('Nordic Oat Mill')
  await expect(brand).toHaveAttribute('readonly', '')
})
