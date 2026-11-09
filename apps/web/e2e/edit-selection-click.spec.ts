import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { paneWithTab } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openWorkspace(page: Page, name: string) {
  await page.locator('nav.tabs').getByRole('button', { name: new RegExp(`^${name}`) }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openSelections(page: Page) {
  await page.locator('.pane-tab', { hasText: 'Selections' }).first().click()
  await expect(page.getByTestId('assortment-list')).toBeVisible()
}

function selectionRow(page: Page, name: string) {
  return page.getByTestId('assortment-list').getByTestId('assortment-row').filter({ hasText: name })
}

const ARTICLE_CHEESE_ID = '018f2000-0000-7000-8000-0000000000a1'
const PRODUCT_CHEESE_ID = '018f2000-0000-7000-8000-0000000000a3'

async function selections(page: Page, type: 'article' | 'product') {
  const list = await (await page.request.get(`/v1/assortments?type=${type}`)).json()
  return list.assortments as Array<Record<string, unknown>>
}

async function articleCheese(page: Page) {
  return (await selections(page, 'article')).find((item) => String(item.id) === ARTICLE_CHEESE_ID)
}

async function productCheese(page: Page) {
  return (await selections(page, 'product')).find((item) => String(item.id) === PRODUCT_CHEESE_ID)
}

// The demo has one Cheese filter mirrored in the Articles and Products panels.
// Resetting only one side would leave the other carrying an earlier test name.
async function resetCheese(page: Page) {
  for (const item of [await articleCheese(page), await productCheese(page)]) {
    if (!item) continue
    const response = await page.request.put(`/v1/assortments/${String(item.id)}`, {
      data: { id: String(item.id), name: 'Cheese', kind: item.kind, query: item.query },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
  }
}

function selectionChips(page: Page, title: string) {
  return paneWithTab(page, title).getByTestId('assortment')
}

async function expectLocked(page: Page, testId: 'selection-type' | 'selection-kind', text: string) {
  const field = page.getByTestId(testId)
  await expect(field).toHaveAttribute('data-locked', 'true')
  await expect(field).toHaveAttribute('aria-readonly', 'true')
  await expect(field).toContainText(text)
  await expect(field.locator('select')).toHaveCount(0)
  await expect(field.locator('svg')).toHaveCount(1)
}

async function expectVisibleNameBorder(page: Page) {
  const border = await page.getByTestId('assortment-name').evaluate((element) => {
    const style = getComputedStyle(element)
    return { width: style.borderTopWidth, style: style.borderTopStyle, color: style.borderTopColor }
  })
  expect(border.width).toBe('1px')
  expect(border.style).toBe('solid')
  expect(border.color).not.toMatch(/transparent|rgba\(0, 0, 0, 0\)/)
}

async function expectCheeseEverywhere(page: Page, name: string) {
  await expect(selectionRow(page, name)).toBeVisible()
  await expect(selectionChips(page, 'Articles')).toHaveText([name, 'Organic'])
  await expect(selectionChips(page, 'Products')).toHaveText([name])
}

async function openEdit(page: Page) {
  const row = selectionRow(page, 'Cheese')
  await expect(row).toBeVisible()
  await row.getByTestId('selection-menu').click()
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Edit selection' }).click()
  const dialog = page.getByTestId('new-selection')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'Edit selection' })).toBeVisible()
  return dialog
}

async function noStrandedOverlay(page: Page) {
  await expect(page.locator('.overlay')).toHaveCount(0)
  await expect(page.getByTestId('new-selection')).toHaveCount(0)
  expect(await page.evaluate(() => getComputedStyle(document.body).pointerEvents)).toBe('auto')
}

test.beforeEach(async ({ page }) => {
  await login(page)
  await resetCheese(page)
})

test('Edit selection from the row menu keeps focus in the dialog and renames a manual Articles selection', async ({ page }, testInfo) => {
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  const before = selectionRow(page, 'Cheese')
  await expect(before).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('01-selections-before.png') })

  const dialog = await openEdit(page)
  await expect(page.getByTestId('assortment-name')).toBeFocused()
  await expectLocked(page, 'selection-type', 'Articles')
  await expectLocked(page, 'selection-kind', 'Manual')
  await expect(dialog.locator('select')).toHaveCount(0)
  await dialog.getByRole('heading', { name: 'Edit selection' }).click()
  await expectVisibleNameBorder(page)
  await page.screenshot({ path: testInfo.outputPath('02-edit-dialog.png') })

  const name = page.getByTestId('assortment-name')
  await name.click()
  await page.keyboard.press('Control+A')
  const selected = await name.evaluate((element) => {
    const input = element as HTMLInputElement
    return { start: input.selectionStart, end: input.selectionEnd, length: input.value.length }
  })
  expect(selected).toEqual({ start: 0, end: 'Cheese'.length, length: 'Cheese'.length })
  expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('assortment-name')
  // Browsers expose an input selection differently: either nothing or exactly
  // the field's text. Either way the page outside the field is not selected.
  expect(['', 'Cheese']).toContain(await page.evaluate(() => window.getSelection()?.toString() ?? ''))
  // Type fast and press Save in the next action: the full value must win.
  await name.pressSequentially('Aged cheese 215', { delay: 0 })
  await dialog.getByRole('button', { name: 'Save selection' }).click()
  await expect(dialog).toBeHidden()
  await noStrandedOverlay(page)
  await expect(selectionRow(page, 'Aged cheese 215').getByTestId('selection-menu')).toBeFocused()
  await expectCheeseEverywhere(page, 'Aged cheese 215')
  await page.screenshot({ path: testInfo.outputPath('03-after-save.png') })

  expect((await articleCheese(page))?.name).toBe('Aged cheese 215')
  expect((await productCheese(page))?.name).toBe('Aged cheese 215')

  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  await expectCheeseEverywhere(page, 'Aged cheese 215')
  await page.screenshot({ path: testInfo.outputPath('04-after-reload.png') })
  expect((await articleCheese(page))?.name).toBe('Aged cheese 215')
  expect((await productCheese(page))?.name).toBe('Aged cheese 215')
})

test('Save shows a pending state and stores the full fast-typed name', async ({ page }, testInfo) => {
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  const dialog = await openEdit(page)

  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/v1/assortments/*', async (route) => {
    if (route.request().method() === 'PUT') await gate
    await route.continue()
  })

  const name = page.getByTestId('assortment-name')
  await name.click()
  await page.keyboard.press('Control+A')
  await name.pressSequentially('Aged cheese 215 pending', { delay: 0 })
  await page.getByTestId('save-selection').click()

  const saving = dialog.getByTestId('save-selection')
  await expect(saving).toHaveText('Saving…')
  await expect(saving).toBeDisabled()
  await expect(dialog).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('06-saving.png') })
  release()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => (await articleCheese(page))?.name).toBe('Aged cheese 215 pending')

  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible()
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  await expectCheeseEverywhere(page, 'Aged cheese 215 pending')
})

test('Cancel closes without saving and leaves the page interactive', async ({ page }, testInfo) => {
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  const dialog = await openEdit(page)
  await page.getByTestId('assortment-name').fill('Cheese cancel 215')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await noStrandedOverlay(page)
  expect((await articleCheese(page))?.name).toBe('Cheese')

  const row = selectionRow(page, 'Cheese')
  await expect(row.getByTestId('selection-menu')).toBeFocused()
  await row.getByRole('button', { name: 'Cheese' }).click()
  await expect(page.getByTestId('assortment-open')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('05-after-cancel.png') })
})

test('The close X discards the edit', async ({ page }) => {
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  const dialog = await openEdit(page)
  await page.getByTestId('assortment-name').fill('Cheese x 215')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await noStrandedOverlay(page)
  expect((await articleCheese(page))?.name).toBe('Cheese')
  await expect(selectionRow(page, 'Cheese').getByTestId('selection-menu')).toBeFocused()
})

test('Escape discards the edit', async ({ page }) => {
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  const dialog = await openEdit(page)
  await page.getByTestId('assortment-name').fill('Cheese escape 215')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await noStrandedOverlay(page)
  expect((await articleCheese(page))?.name).toBe('Cheese')
  await expect(selectionRow(page, 'Cheese').getByTestId('selection-menu')).toBeFocused()
})

test('Editing stays clickable after repeated open and save', async ({ page }) => {
  await openWorkspace(page, 'Articles')
  await openSelections(page)
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const dialog = await openEdit(page)
    const name = page.getByTestId('assortment-name')
    await name.click()
    await name.fill(`Cheese cycle 215 ${cycle}`)
    if (cycle < 2) {
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).toBeHidden()
      await expect(selectionRow(page, 'Cheese')).toBeVisible()
    } else {
      await dialog.getByRole('button', { name: 'Save selection' }).click()
      await expect(dialog).toBeHidden()
      await expect(selectionRow(page, 'Cheese cycle 215 2')).toBeVisible()
    }
  }
})

test('A staged table draft does not block the Edit selection dialog', async ({ page }) => {
  await openWorkspace(page, 'Articles')
  const table = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Articles' }),
  }).getByTestId('object-table').first()
  await expect(table).toBeVisible()
  const row = table.getByTestId('object-row').first()
  await expect(row).toBeVisible()
  await row.locator('[data-column="name"]').first().dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill('Draft article 215')
  await editor.press('Enter')
  await expect(page.getByTestId('object-draft-bar').first()).toBeVisible()

  await openSelections(page)
  const dialog = await openEdit(page)
  await expect(page.getByTestId('assortment-name')).toBeFocused()
  await page.getByTestId('assortment-name').fill('Cheese with draft 215')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('object-draft-bar').first()).toBeVisible()
  await page.getByTestId('discard-draft').first().click()
  await expect(page.getByTestId('object-draft-bar')).toHaveCount(0)
})
