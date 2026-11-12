import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

// Post-merge demo proof for rows 216 and 216b (K1-K5 and K7). Deliberately not
// registered in scripts/e2e.mjs: it deletes owned objects, so only an operator
// may run it against https://demo.braian.io after merge.

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
  return await response.json() as Created
}

async function openProducts(page: Page, filter: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const quick = mainTable(page).getByTestId('quick-filter').first()
  await quick.fill(filter)
  await expect(quick).toHaveValue(filter)
}

function row(page: Page, id: string) {
  return page.locator(`#object-row-${id}`)
}

async function rowMenuDelete(page: Page, id: string) {
  await row(page, id).click({ button: 'right' })
  await page.getByTestId('context-menu').getByRole('menuitem', { name: /^Delete/ }).click()
  const dialog = page.getByTestId('delete-object-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

async function expectNoGraphError(page: Page) {
  await expect(page.getByText('The graph could not be loaded.')).toHaveCount(0)
  await expect(page.getByText('Validation stopped the save.')).toHaveCount(0)
}

async function openDetail(page: Page) {
  await page.locator('.pane-tab[data-view-type="object_detail"]').first().click()
  await expect(page.getByTestId('object-detail')).toBeVisible()
}

async function openGraph(page: Page) {
  await page.locator('.pane-tab[data-view-type="graph"]').first().click()
  await expect(page.locator('canvas[data-testid=graph]')).toBeVisible()
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true')
}

async function restore(page: Page, label: string) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('user-menu-trash').click()
  const trash = page.getByTestId('trash-dialog')
  await expect(trash).toBeVisible()
  const item = trash.locator('li').filter({ hasText: label }).filter({ hasNotText: `${label}-` }).first()
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Restore' }).click()
  await expect(item).toHaveCount(0)
}

test.describe('demo 216/216b delete and restore', () => {
  test('K1/K4/K7: four entry points open one dialog, typing keeps its text', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const number = `DEMO216B-ONE-${Date.now().toString().slice(-7)}`
    await login(page)
    const created = await createObject(page, 'product', number)
    try {
      await openProducts(page, number)
      await expect(row(page, created.id)).toBeVisible()

      // K7: the quick-filter keeps Delete to itself.
      const quick = mainTable(page).getByTestId('quick-filter').first()
      await quick.focus()
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-object-dialog')).toBeHidden()
      await expect(quick).toHaveValue(number)

      // K1/K4: row menu, Detail header, palette and the Delete key.
      const dialog = await rowMenuDelete(page, created.id)
      await expect(dialog.getByTestId('delete-object-counts')).toContainText('Removes 1 object')
      await expect(page.getByTestId('cancel-delete-object')).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()

      await page.keyboard.press('Control+K')
      const palette = page.getByTestId('palette-input')
      await expect(palette).toBeVisible()
      await palette.fill(number)
      await page.getByRole('option').first().click()
      await expect(page.getByTestId('object-detail')).toBeVisible()
      await page.getByTestId('object-detail').getByTestId('delete-object-detail').click()
      await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
      await page.keyboard.press('Escape')

      await page.keyboard.press('Control+K')
      await expect(palette).toBeVisible()
      await palette.fill('Delete')
      await page.getByRole('option').filter({ hasText: 'Move the selected object to Trash' }).first().click()
      await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
      await page.keyboard.press('Escape')

      await row(page, created.id).click()
      await page.keyboard.press('Delete')
      await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
      await page.keyboard.press('Escape')

      const still = await page.request.get(`/v1/objects/${created.id}`)
      expect(still.status()).toBe(200)
      await page.screenshot({ path: testInfo.outputPath('demo216b-entry-points.png') })
    } finally {
      await page.request.delete(`/v1/objects/${created.id}`).catch(() => undefined)
    }
  })

  test('K2/K3/K5: counts, multi-select and a restored product with an earlier deleted link', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const stamp = Date.now().toString().slice(-7)
    const prefix = `DEMO216B-RESTORE-${stamp}`
    await login(page)
    const a = await createObject(page, 'product', `${prefix}-A`)
    const b = await createObject(page, 'product', `${prefix}-B`)
    const first = await createObject(page, 'article', `${prefix}-ART1`)
    const second = await createObject(page, 'article', `${prefix}-ART2`)
    const alive = await link(page, a.id, first.id)
    const earlier = await link(page, a.id, second.id)
    try {
      const removed = await page.request.delete(`/v1/objects/${second.id}`)
      expect(removed.ok(), await removed.text()).toBeTruthy()

      await openProducts(page, prefix)
      await expect(row(page, a.id)).toBeVisible()
      await expect(row(page, b.id)).toBeVisible()

      // K3: two selected objects plus the one unique live link.
      await row(page, a.id).click()
      await row(page, b.id).click({ modifiers: ['Control'] })
      await page.keyboard.press('Delete')
      const multi = page.getByTestId('delete-object-dialog')
      await expect(multi).toBeVisible()
      await expect(multi.getByTestId('delete-object-counts')).toHaveText('Removes 2 objects and 1 link')
      await page.keyboard.press('Escape')

      // K2: one object and one live link, said once.
      await row(page, a.id).click()
      const single = await rowMenuDelete(page, a.id)
      await expect(single.getByTestId('delete-object-counts')).toHaveText('Removes 1 object and 1 link')
      await expect(single.getByTestId('delete-object-counts')).toHaveCount(1)
      await single.getByTestId('confirm-delete-object').click()
      await expect(single).toBeHidden()
      await expect(row(page, a.id)).toHaveCount(0)

      // Right after delete the Detail pane says deleted, not "graph could not be loaded".
      await page.locator('.pane-tab[data-view-type="object_detail"]').first().click()
      await expect(page.getByTestId('detail-deleted')).toBeVisible()
      await expectNoGraphError(page)

      // K5: restore A, reload and open Detail and Graph.
      await restore(page, `${prefix}-A`)
      await expect.poll(async () => (await page.request.get(`/v1/objects/${a.id}`)).status()).toBe(200)
      await page.reload()
      await expect(page.getByTestId('workspace')).toBeVisible()
      await openProducts(page, prefix)
      await expect(row(page, a.id)).toBeVisible({ timeout: 30_000 })
      await row(page, a.id).click()
      await openDetail(page)
      await expectNoGraphError(page)
      await openGraph(page)
      await expectNoGraphError(page)
      await page.screenshot({ path: testInfo.outputPath('demo216b-restored-graph.png') })

      expect((await page.request.get(`/v1/objects/${a.id}`)).status()).toBe(200)
      expect((await page.request.get(`/v1/objects/${alive.id}`)).status()).toBe(200)
      expect((await page.request.get(`/v1/objects/${earlier.id}`)).status()).toBe(410)
      expect((await page.request.get(`/v1/objects/${second.id}`)).status()).toBe(410)

      await page.getByTestId('user-menu').click()
      await page.getByTestId('user-menu-trash').click()
      await expect(page.getByTestId('trash-dialog').getByRole('button', { name: 'Restore' }).first()).toBeVisible()
      await page.keyboard.press('Escape')
    } finally {
      await page.request.delete(`/v1/objects/${a.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${b.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${first.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${second.id}`).catch(() => undefined)
    }
  })
})
