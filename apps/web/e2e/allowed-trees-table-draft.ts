import { expect, type Locator, type Page } from '@playwright/test'

/** Check the fixture tree once so the attribute table has a staged type-header edit. */
export async function checkAllowedTreeOnce(checkbox: Locator) {
  if (await checkbox.isChecked()) {
    await checkbox.click()
    await expect(checkbox).not.toBeChecked()
  }
  await checkbox.click()
  await expect(checkbox).toBeChecked()
}

/** Stage type-header (allowed trees) edits from the attribute table before review. */
export async function saveAttributeTableDraft(page: Page) {
  const table = page.getByTestId('attribute-table')
  await expect(table.getByTestId('review-and-save')).toBeVisible()
  await table.getByTestId('review-and-save').click()
}