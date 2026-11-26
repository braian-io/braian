import { expect, type Page } from '@playwright/test'

/** Allowed-tree toggles open review on the click. The attribute table has no Save button. */
export async function saveAttributeTableDraft(page: Page) {
  const table = page.getByTestId('attribute-table')
  await expect(table.getByTestId('review-and-save')).toHaveCount(0)
  await expect(page.getByTestId('review-loading').or(page.getByTestId('review-dialog'))).toBeVisible()
}