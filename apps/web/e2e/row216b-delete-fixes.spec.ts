import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type Created = { id: string; version: number }

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
  await expect(mainTable(page)).toBeVisible()
}

async function createObject(page: Page, type: 'product' | 'article', number: string): Promise<Created> {
  const response = await page.request.post('/v1/objects', {
    data: {
      type,
      groups: { food: type === 'product' ? 'bread' : 'cheese' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(response.ok(), `create ${type} ${response.status()} ${await response.text()}`).toBeTruthy()
  return await response.json() as Created
}

async function link(page: Page, from: string, to: string) {
  const response = await page.request.post('/v1/links', {
    data: { type: 'product_articles', from_id: from, to_id: to },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as Created
}

async function filterTo(page: Page, text: string) {
  const filter = mainTable(page).getByTestId('quick-filter').first()
  await filter.fill(text)
  await expect(filter).toHaveValue(text)
}

function rowFor(page: Page, id: string) {
  return page.locator(`#object-row-${id}`)
}

async function openDeleteDialogFromRowMenu(page: Page, id: string) {
  await rowFor(page, id).click({ button: 'right' })
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: /^Delete/ }).click()
  const dialog = page.getByTestId('delete-object-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

function counts(dialog: ReturnType<Page['getByTestId']>) {
  return dialog.getByTestId('delete-object-counts')
}

function detailTab(page: Page) {
  return page.locator('.pane-tab[data-view-type="object_detail"]').first()
}

function graphTab(page: Page) {
  return page.locator('.pane-tab[data-view-type="graph"]').first()
}

async function expectNoGraphError(page: Page) {
  await expect(page.getByText('The graph could not be loaded.')).toHaveCount(0)
  await expect(page.getByText('Validation stopped the save.')).toHaveCount(0)
}

async function openDetail(page: Page) {
  await detailTab(page).click()
  await expect(page.getByTestId('object-detail')).toBeVisible()
}

async function openGraph(page: Page) {
  await graphTab(page).click()
  await expect(page.locator('canvas[data-testid=graph]')).toBeVisible()
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true')
}

async function restoreFromTrash(page: Page, label: string) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('user-menu-trash').click()
  const trash = page.getByTestId('trash-dialog')
  await expect(trash).toBeVisible()
  const item = trash.locator('li').filter({ hasText: label }).filter({ hasNotText: `${label}-` }).first()
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Restore' }).click()
  await expect(item).toHaveCount(0)
}

test.describe('row 216b delete fixes', () => {
  test('K5: restored product opens in Detail and Graph with an earlier deleted article link still gone', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const stamp = Date.now().toString().slice(-7)
    const number = `R216B-RESTORE-${stamp}`
    await login(page)
    const product = await createObject(page, 'product', number)
    const first = await createObject(page, 'article', `${number}-ART1`)
    const second = await createObject(page, 'article', `${number}-ART2`)
    const keptLink = await link(page, product.id, first.id)
    const earlierLink = await link(page, product.id, second.id)
    try {
      // The second article was deleted earlier, in a different batch.
      const removedEarlier = await page.request.delete(`/v1/objects/${second.id}`)
      expect(removedEarlier.ok(), await removedEarlier.text()).toBeTruthy()

      await openProducts(page)
      await filterTo(page, number)
      await expect(rowFor(page, product.id)).toBeVisible()
      await rowFor(page, product.id).click()
      await openDetail(page)
      await expect(page.getByTestId('object-detail')).toContainText(number)
      await openGraph(page)
      await expectNoGraphError(page)

      const dialog = await openDeleteDialogFromRowMenu(page, product.id)
      await expect(counts(dialog)).toHaveText('Removes 1 object and 1 link')
      await expect(counts(dialog)).toHaveCount(1)
      await dialog.getByTestId('confirm-delete-object').click()
      await expect(dialog).toBeHidden()
      await expect(rowFor(page, product.id)).toHaveCount(0)

      await detailTab(page).click()
      await expect(page.getByTestId('detail-deleted')).toBeVisible()
      await expectNoGraphError(page)
      await page.screenshot({ path: testInfo.outputPath('row216b-detail-after-delete.png') })

      await restoreFromTrash(page, number)
      await expect.poll(async () => (await page.request.get(`/v1/objects/${product.id}`)).status()).toBe(200)

      await page.reload()
      await expect(page.getByTestId('workspace')).toBeVisible()
      await openProducts(page)
      await filterTo(page, number)
      await expect(rowFor(page, product.id)).toBeVisible({ timeout: 30_000 })
      await rowFor(page, product.id).click()
      await openDetail(page)
      await expect(page.getByTestId('object-detail')).toContainText(number)
      await expectNoGraphError(page)
      await openGraph(page)
      await expectNoGraphError(page)
      await page.screenshot({ path: testInfo.outputPath('row216b-detail-after-restore.png') })

      const restored = await page.request.get(`/v1/objects/${product.id}`)
      expect(restored.status()).toBe(200)
      const kept = await page.request.get(`/v1/objects/${keptLink.id}`)
      expect(kept.status()).toBe(200)
      const earlier = await page.request.get(`/v1/objects/${earlierLink.id}`)
      expect(earlier.status()).toBe(410)
      const earlierArticle = await page.request.get(`/v1/objects/${second.id}`)
      expect(earlierArticle.status()).toBe(410)

      await page.getByTestId('user-menu').click()
      await page.getByTestId('user-menu-trash').click()
      const trash = page.getByTestId('trash-dialog')
      await expect(trash).toBeVisible()
      await expect(trash.getByRole('button', { name: 'Restore' }).first()).toBeVisible()
      await page.keyboard.press('Escape')
    } finally {
      await page.request.delete(`/v1/objects/${product.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${first.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${second.id}`).catch(() => undefined)
    }
  })

  test('K2/K3: counts name objects and links once, with correct plural and unique live links', async ({ page }) => {
    test.setTimeout(180_000)
    const stamp = Date.now().toString().slice(-7)
    const prefix = `R216B-COUNT-${stamp}`
    await login(page)
    const a = await createObject(page, 'product', `${prefix}-A`)
    const b = await createObject(page, 'product', `${prefix}-B`)
    const article = await createObject(page, 'article', `${prefix}-ART`)
    const live = await link(page, a.id, article.id)
    try {
      await openProducts(page)
      await filterTo(page, prefix)
      await expect(rowFor(page, a.id)).toBeVisible()
      await expect(rowFor(page, b.id)).toBeVisible()

      const quick = mainTable(page).getByTestId('quick-filter').first()
      await quick.focus()
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-object-dialog')).toBeHidden()
      await expect(quick).toHaveValue(prefix)

      await rowFor(page, a.id).click()
      await rowFor(page, b.id).click({ modifiers: ['Control'] })
      await expect(rowFor(page, b.id)).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('Delete')
      const multi = page.getByTestId('delete-object-dialog')
      await expect(multi).toBeVisible()
      await expect(counts(multi)).toHaveText('Removes 2 objects and 1 link')
      await expect(counts(multi)).toHaveCount(1)
      await page.keyboard.press('Escape')
      await expect(multi).toBeHidden()

      await rowFor(page, a.id).click()
      await expect(rowFor(page, a.id)).toHaveAttribute('aria-selected', 'true')
      await expect(rowFor(page, b.id)).not.toHaveAttribute('aria-selected', 'true')
      const single = await openDeleteDialogFromRowMenu(page, a.id)
      await expect(counts(single)).toHaveText('Removes 1 object and 1 link')
      await expect(counts(single)).toHaveCount(1)
      await single.getByTestId('confirm-delete-object').click()
      await expect(single).toBeHidden()
      await expect(rowFor(page, a.id)).toHaveCount(0)

      const deleted = await page.request.get(`/v1/objects/${a.id}`)
      expect(deleted.status()).toBe(410)
      const goneLink = await page.request.get(`/v1/objects/${live.id}`)
      expect(goneLink.status()).toBe(410)
    } finally {
      await page.request.delete(`/v1/objects/${a.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${b.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${article.id}`).catch(() => undefined)
    }
  })
})
