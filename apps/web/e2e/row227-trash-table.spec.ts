import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openTrashTable(page: Page) {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('user-menu-trash').click()
  const table = page.getByTestId('trash-table-chrome')
  await expect(table).toBeVisible()
  return table
}

test('trash table restore and purge', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString().slice(-7)
  const number = `R227-${stamp}`
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
  const created = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(created.ok()).toBeTruthy()
  const { id } = await created.json() as { id: string }
  try {
    const deleted = await page.request.delete(`/v1/objects/${id}`)
    expect(deleted.ok()).toBeTruthy()
    const table = await openTrashTable(page)
    const row = table.locator('[data-testid="trash-row"]').filter({ hasText: number })
    await expect(row).toBeVisible()
    await expect(row.locator('[data-column="name"]')).toContainText(number)
    await expect(row.locator('[data-column="type"]')).toContainText('product')
    await row.click()
    const numberTitle = await row.locator('[data-column="number"]').getAttribute('title')
    if (numberTitle) {
      expect(numberTitle).toBe(number)
      expect(numberTitle).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    }
    await page.locator('.pane-tab[data-view-type="object_detail"]').first().click()
    const detail = page.getByTestId('object-detail')
    await expect(detail).toBeVisible({ timeout: 60_000 })
    await expect(detail).toHaveAttribute('data-detail-ready', 'true', { timeout: 60_000 })
    await expect(detail).toContainText(number)
    await page.getByTestId('trash-detail-restore').click()
    await expect(row).toHaveCount(0)
    const live = await page.request.get(`/v1/objects/${id}`)
    expect(live.ok()).toBeTruthy()
    const deletedAgain = await page.request.delete(`/v1/objects/${id}`)
    expect(deletedAgain.ok()).toBeTruthy()
    await openTrashTable(page)
    const rowAgain = table.locator('[data-testid="trash-row"]').filter({ hasText: number })
    await expect(rowAgain).toBeVisible()
    await rowAgain.click({ button: 'right' })
    await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Delete permanently' }).click()
    const dialog = page.getByTestId('trash-purge-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(number)
    await dialog.getByTestId('confirm-trash-purge').click()
    await expect(dialog).toBeHidden()
    await expect(rowAgain).toHaveCount(0)
    const gone = await page.request.get(`/v1/objects/${id}`)
    expect(gone.status()).toBe(404)

    const palette = page.getByTestId('palette-input')
    const numberPalette = `${number}-K-RESTORE`
    const paletteRestore = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'bread' },
        values: { number: numberPalette, name: { en: numberPalette }, status: 'draft' },
      },
    })
    expect(paletteRestore.ok()).toBeTruthy()
    const { id: idPaletteRestore } = await paletteRestore.json() as { id: string }
    const deletedPaletteRestore = await page.request.delete(`/v1/objects/${idPaletteRestore}`)
    expect(deletedPaletteRestore.ok()).toBeTruthy()
    await openTrashTable(page)
    const rowPaletteRestore = table.locator('[data-testid="trash-row"]').filter({ hasText: numberPalette })
    await expect(rowPaletteRestore).toBeVisible()
    await rowPaletteRestore.click()
    await page.keyboard.press('Control+K')
    await expect(palette).toBeVisible()
    await palette.fill('Restore')
    const restoreOption = page.getByRole('option', { name: 'Restore', exact: true })
    await expect(restoreOption).toBeVisible()
    await restoreOption.click()
    await expect(page.getByTestId('command-palette')).toBeHidden()
    await expect(rowPaletteRestore).toHaveCount(0)
    const livePaletteRestore = await page.request.get(`/v1/objects/${idPaletteRestore}`)
    expect(livePaletteRestore.status()).toBe(200)
    await page.request.delete(`/v1/objects/${idPaletteRestore}`).catch(() => undefined)

    const numberPalettePurge = `${number}-K-PURGE`
    const palettePurge = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'bread' },
        values: { number: numberPalettePurge, name: { en: numberPalettePurge }, status: 'draft' },
      },
    })
    expect(palettePurge.ok()).toBeTruthy()
    const { id: idPalettePurge } = await palettePurge.json() as { id: string }
    const deletedPalettePurge = await page.request.delete(`/v1/objects/${idPalettePurge}`)
    expect(deletedPalettePurge.ok()).toBeTruthy()
    await openTrashTable(page)
    const rowPalettePurge = table.locator('[data-testid="trash-row"]').filter({ hasText: numberPalettePurge })
    await expect(rowPalettePurge).toBeVisible()
    await rowPalettePurge.click()
    await page.keyboard.press('Control+K')
    await expect(palette).toBeVisible()
    await palette.fill('Delete permanently')
    const purgeOption = page.getByRole('option', { name: 'Delete permanently', exact: true })
    await expect(purgeOption).toBeVisible()
    await purgeOption.click()
    await expect(page.getByTestId('command-palette')).toBeHidden()
    const dialogPalette = page.getByTestId('trash-purge-dialog')
    await expect(dialogPalette).toBeVisible()
    await expect(dialogPalette).toContainText(numberPalettePurge)
    await dialogPalette.getByTestId('confirm-trash-purge').click()
    await expect(dialogPalette).toBeHidden()
    await expect(rowPalettePurge).toHaveCount(0)
    const gonePalette = await page.request.get(`/v1/objects/${idPalettePurge}`)
    expect(gonePalette.status()).toBe(404)
  } finally {
    await page.request.delete(`/v1/objects/${id}`).catch(() => undefined)
  }
})