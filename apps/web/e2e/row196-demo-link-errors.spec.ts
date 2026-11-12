import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

// Post-merge demo proof for row 196 (criteria 1-5). Deliberately not registered
// in scripts/e2e.mjs: it writes owned DEMO196-* objects, so only an operator may
// run it against https://demo.braian.io after merge.

type Created = { id: string; version: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function createObject(page: Page, type: 'product' | 'article', number: string): Promise<Created> {
  const response = await page.request.post('/v1/objects', {
    data: {
      type,
      groups: { food: type === 'product' ? 'bread' : 'cheese' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as Created
}

async function link(page: Page, from: string, to: string) {
  const response = await page.request.post('/v1/links', {
    data: { type: 'product_articles', from_id: from, to_id: to },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
}

async function productPeers(page: Page, articleId: string): Promise<string[]> {
  const response = await page.request.get(`/v1/objects/${articleId}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as {
    links?: Array<{ link_type?: string; links?: Array<{ peer_id?: string }> }>
  }
  return (body.links ?? [])
    .filter((side) => side.link_type === 'product_articles')
    .flatMap((side) => side.links ?? [])
    .map((item) => String(item.peer_id ?? ''))
    .filter(Boolean)
}

async function openArticles(page: Page, filter: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Articles/ }).click()
  const table = mainTable(page, 'Articles')
  const quick = table.getByTestId('quick-filter').first()
  await quick.fill(filter)
  await expect(quick).toHaveValue(filter)
  return table
}

async function allProducts(page: Page, filter: string) {
  const pane = paneWithTab(page, 'Products')
  const show = pane.getByTestId('peer-show-all')
  if (await show.isVisible()) await show.click()
  const table = mainTable(page, 'Products')
  const quick = table.getByTestId('quick-filter').first()
  await quick.fill(filter)
  await expect(quick).toHaveValue(filter)
  return table
}

function row(table: Locator, key: string) {
  return table.getByTestId('object-row').filter({ hasText: key }).first()
}

test.describe('demo 196 link field errors and replace', () => {
  test('K1-K5: field error, cardinality, current draft and a clean footer', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const stamp = Date.now().toString().slice(-7)
    const prefix = `DEMO196-${stamp}`
    const articleNumber = `${prefix}-ART`
    const secondArticleNumber = `${prefix}-ART2`
    const productA = `${prefix}-PROD-A`
    const productB = `${prefix}-PROD-B`
    await login(page)
    const article = await createObject(page, 'article', articleNumber)
    const secondArticle = await createObject(page, 'article', secondArticleNumber)
    const a = await createObject(page, 'product', productA)
    const b = await createObject(page, 'product', productB)
    try {
      await link(page, a.id, article.id)
      expect(await productPeers(page, article.id)).toEqual([a.id])

      const articles = await openArticles(page, articleNumber)
      let products = await allProducts(page, productB)
      const articleRow = row(articles, articleNumber)
      await expect(articleRow).toBeVisible()
      const productRow = row(products, productB)
      await expect(productRow).toBeVisible()

      // K1: an invalid Sort order stays at the field, the dialog stays open, nothing is written.
      await articleRow.dragTo(productRow)
      const dialog = page.getByTestId('link-create-dialog')
      await expect(dialog).toBeVisible()
      const sort = dialog.getByTestId('link-field-sort_order')
      await expect(sort).toHaveAttribute('data-kind', 'number')
      await sort.fill('test')
      await dialog.getByTestId('link-create-confirm').click()
      await expect(dialog.getByTestId('link-field-error-sort_order')).toContainText('Enter a number')
      await expect(dialog).toBeVisible()
      expect(await productPeers(page, article.id)).toEqual([a.id])
      await page.screenshot({ path: testInfo.outputPath('row196-field-error.png') })

      // K2/K5: a valid value explains the one-link cardinality and offers Replace, no raw footer error.
      await sort.fill('4')
      await dialog.getByTestId('link-create-confirm').click()
      const conflict = dialog.getByTestId('link-cardinality')
      await expect(conflict).toBeVisible()
      await expect(conflict).toContainText(/already has a product link|only one/i)
      await expect(dialog.getByTestId('link-replace')).toBeVisible()
      await expect(page.getByTestId('status-bar')).not.toContainText('Save failed')
      await page.screenshot({ path: testInfo.outputPath('row196-cardinality.png') })

      // K4: Replace follows the current draft. An invalid one disables it and writes nothing.
      await sort.fill('test')
      const replace = dialog.getByTestId('link-replace')
      await expect(replace).toBeDisabled()
      await expect(dialog.getByTestId('link-field-error-sort_order')).toContainText('Enter a number')
      expect(await productPeers(page, article.id)).toEqual([a.id])
      await page.screenshot({ path: testInfo.outputPath('row196-invalid-replace.png') })

      await sort.fill('7')
      await expect(replace).toBeEnabled()
      await replace.click()
      await expect(dialog).toBeHidden()
      await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Replaced the existing link' })).toBeVisible()
      expect(await productPeers(page, article.id)).toEqual([b.id])

      // K3: a first link with a numeric Sort order still saves and keeps Undo.
      await products.getByTestId('quick-filter').first().fill(productA)
      products = await allProducts(page, productA)
      await articles.getByTestId('quick-filter').first().fill(secondArticleNumber)
      const secondRow = row(articles, secondArticleNumber)
      await expect(secondRow).toBeVisible()
      await secondRow.dragTo(row(products, productA))
      const first = page.getByTestId('link-create-dialog')
      await expect(first).toBeVisible()
      await first.getByTestId('link-field-sort_order').fill('3')
      await first.getByTestId('link-create-confirm').click()
      await expect(first).toBeHidden()
      const saved = page.locator('[data-sonner-toast]').filter({ hasText: 'Linked 1 article' })
      await expect(saved).toBeVisible()
      await expect(saved.getByRole('button', { name: 'Undo' })).toBeVisible()
      expect(await productPeers(page, secondArticle.id)).toEqual([a.id])
      await saved.getByRole('button', { name: 'Undo' }).click()
      await expect.poll(async () => productPeers(page, secondArticle.id)).toEqual([])
      await page.screenshot({ path: testInfo.outputPath('row196-first-link-undo.png') })
    } finally {
      await page.request.delete(`/v1/objects/${article.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${secondArticle.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${a.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${b.id}`).catch(() => undefined)
    }
  })
})
