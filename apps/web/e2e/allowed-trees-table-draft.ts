import { expect, type Page } from '@playwright/test'

/** Stage type-header (allowed trees) edits from the attribute table before review. */
export async function saveAttributeTableDraft(page: Page) {
  const table = page.getByTestId('attribute-table')
  await expect(table.getByTestId('review-and-save')).toBeVisible()
  await table.getByTestId('review-and-save').click()
}