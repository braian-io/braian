import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function command(page: Page, title: string) {
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('palette-input')
  await expect(palette).toBeVisible()
  await palette.fill(title)
  await page.keyboard.press('Enter')
}

async function openObject(page: Page, key: string) {
  await expect(page.getByTestId('workspace')).toBeVisible()
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('palette-input')
  await palette.fill(key)
  await expect(page.getByRole('option').first()).toContainText(key)
  await expect(palette).toHaveAttribute('data-palette-active', /^\d+$/)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('object-detail')).toBeVisible()
  await expect(page.getByTestId('object-detail')).toContainText(key)
}

test('pairs with links two cheeses from the keyboard and the link type can be deleted', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await command(page, 'Data model')
  await expect(page.getByTestId('data-model').first()).toBeVisible()
  await expect(page.getByText('Link types').first()).toBeVisible()

  await command(page, 'New link type')
  await page.getByTestId('model-dialog-name').fill('Pairs with')
  await page.getByTestId('link-type-from').selectOption('article')
  await page.getByTestId('link-type-to').selectOption('article')
  await page.getByTestId('link-type-attribute').fill('note')
  await page.getByTestId('model-dialog-save').click()
  await expect(page.getByTestId('unsaved-changes')).toBeVisible()
  await page.keyboard.press('Control+S')
  await page.getByTestId('confirm-review').click()
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
  const linkTypeRow = page.getByTestId('link-types-table').locator('[data-row-id="pairs_with"]')
  await page.locator('.pane-tab', { hasText: 'Link types' }).first().click()
  await expect(linkTypeRow).toBeVisible()

  const productsTab = page.locator('nav.tabs').getByRole('button', { name: /^Products/ })
  await productsTab.click()
  await expect(productsTab).toHaveClass(/active/)
  await openObject(page, 'ART-CHED-200')
  const pairsSection = page.getByTestId('link-section').filter({ hasText: 'Pairs with' }).first()
  await pairsSection.getByTestId('add-link').focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('link-search').fill('ART-CHED-400')
  await expect(page.getByRole('option').first()).toContainText('ART-CHED-400')
  await page.keyboard.press('Enter')
  const created = page.getByTestId('link-create-dialog')
  await expect(created).toBeVisible()
  await created.getByTestId('link-type-choice').selectOption('pairs_with:out')
  await created.getByTestId('link-field-note').fill('aged')
  await created.getByTestId('link-create-confirm').click()
  await expect(created).toBeHidden()
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-CHED-400' }).first()).toBeVisible()

  await openObject(page, 'ART-CHED-400')
  await expect(
    page.getByTestId('link-section').filter({ hasText: 'Pairs with' }).getByTestId('link-row').filter({ hasText: 'ART-CHED-200' }),
  ).toBeVisible()

  await command(page, 'Data model')
  await page.locator('.pane-tab', { hasText: 'Link types' }).first().click()
  await linkTypeRow.click()
  await command(page, 'Delete link type')
  const dialog = page.getByTestId('consequence')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('confirm-name')).toHaveCount(0)
  await page.getByTestId('confirm-delete').click()
  await expect(dialog).toBeHidden()
  await expect(linkTypeRow).toHaveCount(0)
})

test('removing a link with values opens a plain confirm with no text input', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const key = `rated_with_${crypto.randomUUID().slice(0, 8)}`
  const created = await page.request.post('/v1/link-types', {
    data: {
      key,
      label: 'Rated with',
      from_types: ['product'],
      to_types: ['product'],
      from_key: `${key}_from`,
      from_label: 'Rated',
      to_key: `${key}_to`,
      to_label: 'Rates',
      from_cardinality: 'many',
      to_cardinality: 'many',
      attributes: ['note'],
    },
  })
  expect(created.status(), `create link type ${created.status()}`).toBe(204)

  try {
    const searched = await page.request.get('/v1/search?q=*&filter=type_key:=product&per_page=2')
    const hits = ((await searched.json()) as {
      hits?: Array<{ id?: string; key?: string; document?: { id?: string; key?: string } }>
    }).hits ?? []
    const docs = hits.map((hit) => hit.document ?? hit).filter((doc) => doc.id && doc.key)
    expect(docs.length).toBeGreaterThanOrEqual(2)
    const from = docs[0]!
    const to = docs[1]!
    const linked = await page.request.post('/v1/links', {
      data: { type: key, from_id: from.id, to_id: to.id, values: { note: 'aged' } },
    })
    expect(linked.ok(), `create link ${linked.status()}`).toBeTruthy()

    await page.reload()
    await openObject(page, from.key!)

    const linkRow = page.getByTestId('link-row').filter({ hasText: to.key! }).first()
    await expect(linkRow).toBeVisible({ timeout: 30_000 })
    await linkRow.click({ button: 'right' })
    await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Remove link' }).click()

    const dialog = page.getByTestId('link-confirm')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('link-confirm-input')).toHaveCount(0)
    await expect(dialog.locator('input')).toHaveCount(0)
    const remove = dialog.getByTestId('link-confirm-remove')
    await expect(remove).toBeVisible()
    await expect(remove).toHaveClass(/btn-danger/)
    await remove.click()
    await expect(dialog).toBeHidden()
    await expect(linkRow).toHaveCount(0)
  } finally {
    await page.request.delete(`/v1/link-types/${key}`, { timeout: 30_000 }).catch(() => undefined)
  }
})

async function productWithArticles(page: Page) {
  const searched = await page.request.get('/v1/search?q=*&filter=type_key:=product&per_page=100')
  const hits = ((await searched.json()) as {
    hits?: Array<{ id?: string; key?: string; document?: { id?: string; key?: string } }>
  }).hits ?? []
  for (const hit of hits) {
    const product = hit.document ?? hit
    if (!product.id) continue
    const response = await page.request.get(`/v1/links?object=${product.id}`)
    if (!response.ok()) continue
    const sides = (await response.json()) as Array<{
      direction: string
      link_type: string
      links: Array<{ peer_id: string; peer_key: string }>
    }>
    const side = sides.find((item) => item.direction === 'out' && item.link_type === 'product_articles')
    if (side && side.links.length >= 2) return { product, articles: side.links }
  }
  throw new Error('no product with two linked articles')
}

test('removing a link updates the peer list at once and Undo brings the row back', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const { product, articles: linked } = await productWithArticles(page)
  await page.reload()

  const productsTab = page.locator('nav.tabs').getByRole('button', { name: /^Products/ })
  await productsTab.click()
  await expect(productsTab).toHaveClass(/active/)
  const products = mainTable(page, 'Products')
  const articles = paneWithTab(page, 'Articles').getByTestId('object-table').first()
  await expect(products).toBeVisible({ timeout: 60_000 })
  await expect(articles).toBeVisible({ timeout: 60_000 })

  await products.getByTestId('quick-filter').first().fill(product.key!)
  const productRow = products.locator(`#object-row-${product.id}`)
  await expect(productRow).toBeVisible({ timeout: 30_000 })
  await productRow.click()
  await expect(productRow).toHaveAttribute('aria-selected', 'true')
  await page.locator('[data-view-type="object_detail"]').first().click()

  const removed = linked[0]!
  const removedRow = articles.locator(`#object-row-${removed.peer_id}`)
  await expect(removedRow).toBeVisible({ timeout: 30_000 })

  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  const linkRow = detail.getByTestId('link-row').filter({ hasText: removed.peer_key }).first()
  await expect(linkRow).toBeVisible({ timeout: 30_000 })
  await linkRow.click({ button: 'right' })
  await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Remove link' }).click()
  const confirm = page.getByTestId('link-confirm')
  if (await confirm.isVisible()) {
    await confirm.getByTestId('link-confirm-remove').click()
    await expect(confirm).toBeHidden()
  }

  await expect(removedRow).toHaveCount(0, { timeout: 30_000 })
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(removedRow).toBeVisible({ timeout: 30_000 })
})
