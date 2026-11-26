import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, waitDetailReady } from './ui'

const ingredientsHelp = 'List every ingredient for labeling compliance.'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function stageAndSave(page: Page, steps: Array<Record<string, unknown>>) {
  const staged = await page.request.post('/v1/model/draft/steps', { data: { steps } })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
}

async function openProductDetail(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  const filter = mainTable(page).getByTestId('quick-filter').first()
  if ((await filter.inputValue()) !== '') await filter.fill('')
  const row = mainTable(page).getByTestId('object-row').filter({ hasText: 'Cheddar' }).first()
  const fallback = mainTable(page).getByTestId('object-row').first()
  await expect(row.or(fallback)).toBeVisible()
  if ((await row.count()) > 0) await row.click()
  else await fallback.click()
  const detailTab = page.locator('[data-view-type="object_detail"]').first()
  if (await detailTab.isVisible()) await detailTab.click()
  await waitDetailReady(page)
}

function verticalCenterGap(a: { y: number; height: number }, b: { y: number; height: number }) {
  const aCenter = a.y + a.height / 2
  const bCenter = b.y + b.height / 2
  return Math.abs(aCenter - bCenter)
}

test.describe('detail field description tooltip and language tag alignment', () => {
  test('ingredients description on hover; en tag aligns in read and edit', async ({ page }) => {
    test.setTimeout(120_000)
    let hadDescription = false
    let original = ''
    try {
      await login(page)
      const defs = (await (await page.request.get('/v1/definitions')).json()) as {
        attributes?: Array<{ key?: string; description?: string }>
      }
      const attr = defs.attributes?.find((item) => item.key === 'ingredients')
      original = attr?.description ?? ''
      hadDescription = original.trim().length > 0

      await stageAndSave(page, [{ op: 'update_attribute', key: 'ingredients', description: ingredientsHelp }])
      await page.reload()
      await openProductDetail(page)

      const detail = page.getByTestId('object-detail')
      const more = detail.getByTestId('detail-show-more-fields')
      if (await more.isVisible()) {
        if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
      }
      const ingredientsField = detail.locator('.field').filter({
        has: detail.locator('label', { hasText: /^Ingredients\b/ }),
      }).first()
      await expect(ingredientsField).toBeVisible()

      const ingredientsLabel = ingredientsField.locator('label').first()
      const ingredientsTip = page.getByTestId('detail-field-desc-ingredients')
      await expect(ingredientsTip).not.toBeVisible()
      await ingredientsLabel.hover()
      await expect(ingredientsTip).toBeVisible({ timeout: 5_000 })
      await expect(ingredientsTip).toHaveText(ingredientsHelp)

      const nameField = detail.locator('.field').filter({
        has: detail.locator('label', { hasText: /^Name\b/ }),
      }).first()
      await expect(nameField).toBeVisible()
      const langRow = nameField.locator('.lang-row').first()
      const langTag = langRow.locator('.lang-tag').first()
      const value = langRow.locator('input').first()
      await expect(langTag).toHaveText('en')

      const assertAligned = async () => {
        const tagBox = await langTag.boundingBox()
        const valueBox = await value.boundingBox()
        if (!tagBox || !valueBox) throw new Error('missing language tag or value box')
        expect(verticalCenterGap(tagBox, valueBox)).toBeLessThanOrEqual(2)
      }

      await assertAligned()
      await value.click()
      await expect(value).toBeFocused()
      await assertAligned()
    } finally {
      try {
        if (hadDescription) {
          await stageAndSave(page, [{ op: 'update_attribute', key: 'ingredients', description: original }])
        } else {
          await stageAndSave(page, [{ op: 'update_attribute', key: 'ingredients', clear_description: true }])
        }
      } catch {
        // Restore best effort after a failed assertion.
      }
      await page.request.delete('/v1/model/draft').catch(() => undefined)
    }
  })
})