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

async function createProduct(page: Page, number: string): Promise<Created> {
  const response = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(response.ok(), `create product ${response.status()} ${await response.text()}`).toBeTruthy()
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

async function cancelWithEscape(page: Page) {
  await expect(page.getByTestId('cancel-delete-object')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('delete-object-dialog')).toBeHidden()
}

test.describe('row 216 delete object', () => {
  test('four entry points share one dry-run dialog and Escape cancels', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const stamp = Date.now().toString().slice(-7)
    const number = `R216-ONE-${stamp}`
    await login(page)
    const created = await createProduct(page, number)
    await openProducts(page)
    await filterTo(page, number)

    const dialog = await openDeleteDialogFromRowMenu(page, created.id)
    await expect(dialog.getByTestId('delete-object-counts')).toContainText('Removes')
    await page.screenshot({ path: testInfo.outputPath('row216-row-menu-dialog.png') })
    await cancelWithEscape(page)

    // Detail header action on the object Detail pane.
    await page.keyboard.press('Control+K')
    const palette = page.getByTestId('palette-input')
    await expect(palette).toBeVisible()
    await palette.fill(number)
    await expect(page.getByRole('option').first()).toContainText(number)
    await page.keyboard.press('Enter')
    if (await page.getByTestId('command-palette').isVisible().catch(() => false)) {
      await page.keyboard.press('Escape')
    }
    await expect(page.getByTestId('command-palette')).toBeHidden()
    const detail = page.getByTestId('object-detail')
    await expect(detail).toBeVisible()
    await detail.getByTestId('delete-object-detail').click()
    await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('row216-detail-dialog.png') })
    await cancelWithEscape(page)

    // Ctrl+K, findable by typing Delete.
    await page.keyboard.press('Control+K')
    await expect(palette).toBeVisible()
    await palette.fill('Delete')
    const paletteDelete = page.getByRole('option').filter({ hasText: 'Move the selected object to Trash' }).first()
    await expect(paletteDelete).toBeVisible()
    await paletteDelete.click()
    await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('row216-palette-dialog.png') })
    await cancelWithEscape(page)

    // Delete key on the selected row, with no editor open.
    await rowFor(page, created.id).click()
    await expect(rowFor(page, created.id)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(page.getByTestId('delete-object-dialog')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('row216-key-dialog.png') })
    await cancelWithEscape(page)

    const still = await page.request.get(`/v1/objects/${created.id}`)
    expect(still.ok(), 'Escape wrote nothing').toBeTruthy()
    await page.request.delete(`/v1/objects/${created.id}`)
  })

  test('multi-select deletes once after one confirm, leaves search, and Restore brings cascade links back', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const stamp = Date.now().toString().slice(-7)
    const prefix = `R216-MULTI-${stamp}`
    const linkType = `r216_links_${stamp}`
    const linkTypeBody = {
      key: linkType,
      label: 'Row 216 links',
      from_types: ['product'],
      to_types: ['product'],
      from_key: `${linkType}_from`,
      from_label: 'Row 216 from',
      to_key: `${linkType}_to`,
      to_label: 'Row 216 to',
      from_cardinality: 'many',
      to_cardinality: 'many',
      attributes: [],
    }
    await login(page)
    const a = await createProduct(page, `${prefix}-A`)
    const b = await createProduct(page, `${prefix}-B`)
    try {
      const madeType = await page.request.post('/v1/link-types', { data: linkTypeBody })
      expect(madeType.status(), await madeType.text()).toBe(204)
      const linked = await page.request.post('/v1/links', {
        data: { type: linkType, from_id: a.id, to_id: b.id },
      })
      expect(linked.ok(), await linked.text()).toBeTruthy()
      const link = await linked.json() as { id: string }

      await openProducts(page)
      await filterTo(page, prefix)
      const rowA = rowFor(page, a.id)
      const rowB = rowFor(page, b.id)
      await expect(rowA).toBeVisible()
      await expect(rowB).toBeVisible()
      await rowA.click()
      await rowB.click({ modifiers: ['Control'] })
      await expect(rowB).toHaveAttribute('aria-selected', 'true')
      await page.keyboard.press('Delete')

      const dialog = page.getByTestId('delete-object-dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByTestId('delete-object-counts')).toContainText('Removes 3 objects and 1 links')
      await expect(page.getByTestId('cancel-delete-object')).toBeFocused()
      await page.screenshot({ path: testInfo.outputPath('row216-multi-counts.png') })
      await dialog.getByTestId('confirm-delete-object').click()
      await expect(dialog).toBeHidden()

      await expect(rowA).toHaveCount(0)
      await expect(rowB).toHaveCount(0)
      await expect.poll(async () => {
        const response = await page.request.get(`/v1/search?q=${encodeURIComponent(prefix)}&per_page=10`)
        if (!response.ok()) return -1
        const body = await response.json() as { hits?: unknown[] }
        return body.hits?.length ?? 0
      }, { timeout: 30_000 }).toBe(0)

      // Trash Restore puts the object and its same-event cascade link back.
      await page.getByTestId('user-menu').click()
      await page.getByTestId('user-menu-trash').click()
      const trash = page.getByTestId('trash-dialog')
      await expect(trash).toBeVisible()
      const item = trash.locator('li').filter({ hasText: `${prefix}-A` }).first()
      await expect(item).toBeVisible()
      await item.getByRole('button', { name: 'Restore' }).click()
      await expect(item).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('row216-trash-restore.png') })

      await expect.poll(async () => (await page.request.get(`/v1/objects/${a.id}`)).status()).toBe(200)
      await expect.poll(async () => (await page.request.get(`/v1/objects/${link.id}`)).status()).toBe(200)
      const bStillDeleted = await page.request.get(`/v1/objects/${b.id}`)
      expect(bStillDeleted.status(), 'a separate event stays deleted').toBe(410)
    } finally {
      await page.request.delete(`/v1/objects/${a.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${b.id}`).catch(() => undefined)
      await page.request.delete(`/v1/link-types/${linkType}`, { timeout: 30_000 }).catch(() => undefined)
    }
  })
})
