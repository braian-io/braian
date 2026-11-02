import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProducts(page: Page) {
  await page.getByRole('button', { name: 'Products' }).click()
  await expect(page.getByTestId('object-table')).toBeVisible()
}

async function openSelections(page: Page) {
  await page.locator('.pane-tab', { hasText: 'Selections' }).first().click()
  await expect(page.getByTestId('assortment-list')).toBeVisible()
}

async function selectionRow(page: Page, name: string) {
  return page.getByTestId('assortment-list').getByTestId('assortment-row').filter({ hasText: name })
}

async function bindSelectionToProductsView(page: Page, selectionId: string) {
  const workspaces = await (await page.request.get('/v1/workspaces')).json()
  const workspace = (workspaces.workspaces as Array<{ id: string; name: string }>).find(
    (item) => item.name === 'Products',
  )
  expect(workspace).toBeTruthy()
  if (!workspace) return null
  const detail = await (await page.request.get(`/v1/workspaces/${workspace.id}`)).json()
  const view = (detail.views as Array<{ id: string; type: string; title: string; pane?: string; position?: number; state?: Record<string, unknown> }>).find(
    (item) => item.type === 'object_table',
  )
  expect(view).toBeTruthy()
  if (!view) return null
  const response = await page.request.post('/v1/views', {
    data: {
      id: view.id,
      workspace_id: workspace.id,
      type: view.type,
      title: view.title,
      pane: view.pane ?? 'center',
      position: view.position ?? 0,
      state: { ...(view.state ?? {}), selection_id: selectionId },
    },
  })
  const status = response.status()
  const body = await response.text()
  expect(response.ok(), `save view failed: ${status} ${body}`).toBeTruthy()
  return { workspaceId: workspace.id, viewId: view.id }
}

test('dynamic selections can be created, edited and deleted with usage', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)

  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New selection')
  await page.keyboard.press('Enter')

  const dialog = page.getByTestId('new-selection')
  await expect(dialog).toBeVisible()
  await page.getByTestId('assortment-name').fill('Fresh cheese')
  await page.getByTestId('selection-kind').selectOption('dynamic')
  await page.getByTestId('selection-query').fill('type_key:=product && groups:=food:cheese')
  await dialog.getByRole('button', { name: 'Save selection' }).click()
  await expect(dialog).toBeHidden()

  await openSelections(page)
  await expect(await selectionRow(page, 'Fresh cheese')).toBeVisible()

  const saved = await (await page.request.get('/v1/assortments?type=product')).json()
  const selection = (saved.assortments as Array<{ id: string; name: string }>).find(
    (item) => item.name === 'Fresh cheese',
  )
  expect(selection).toBeTruthy()
  if (!selection) return

  const bound = await bindSelectionToProductsView(page, selection.id)
  expect(bound).toBeTruthy()

  const row = await selectionRow(page, 'Fresh cheese')
  await expect(row).toBeVisible()
  await row.getByTestId('selection-menu').click()
  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Edit selection' }).click()

  const edit = page.getByTestId('new-selection')
  await expect(edit.getByRole('heading', { name: 'Edit selection' })).toBeVisible()
  await expect(page.getByTestId('selection-type')).toBeDisabled()
  await expect(page.getByTestId('selection-kind')).toBeDisabled()
  await page.getByTestId('assortment-name').fill('Aged cheese')
  await page.getByTestId('selection-query').fill('type_key:=product && groups:=food:cheese && a_labels:=organic_eu')
  await edit.getByRole('button', { name: 'Save selection' }).click()
  await expect(edit).toBeHidden()
  await expect(await selectionRow(page, 'Aged cheese')).toBeVisible()
  await expect(await selectionRow(page, 'Fresh cheese')).toHaveCount(0)

  const edited = await selectionRow(page, 'Aged cheese')
  await expect(edited).toBeVisible()
  await edited.getByTestId('selection-menu').click()
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Delete selection' }).click()

  const confirm = page.getByTestId('delete-selection')
  await expect(confirm).toBeVisible()
  await expect(confirm.getByTestId('selection-usage')).toContainText('Products')
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expect(await selectionRow(page, 'Aged cheese')).toHaveCount(0)

  if (bound) {
    const after = await (await page.request.get(`/v1/workspaces/${bound.workspaceId}`)).json()
    const view = (after.views as Array<{ id: string; state?: Record<string, unknown> }>).find(
      (item) => item.id === bound.viewId,
    )
    expect(view?.state?.selection_id).toBeUndefined()
  }
})

test('Ctrl+K saves the current view filter as a dynamic selection', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await openProducts(page)

  const cheese = page.getByTestId('assortment').filter({ hasText: 'Cheese' }).first()
  await expect(cheese).toBeVisible()
  await cheese.click()
  await expect(cheese).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('Save filter as selection')
  await expect(palette.locator('.hit').filter({ hasText: 'Save filter as selection' }).first()).toBeVisible()
  await page.keyboard.press('Enter')

  const dialog = page.getByTestId('new-selection')
  await expect(dialog).toBeVisible()
  await expect(page.getByTestId('selection-kind')).toHaveValue('dynamic')
  await expect(page.getByTestId('selection-query')).toHaveValue(/type_key:=product/)
  await expect(page.getByTestId('selection-query')).toHaveValue(/groups:=food:cheese/)
  await page.getByTestId('assortment-name').fill('Cheese filter')
  await dialog.getByRole('button', { name: 'Save selection' }).click()
  await expect(dialog).toBeHidden()

  await openSelections(page)
  const row = await selectionRow(page, 'Cheese filter')
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByTestId('assortment-open')).toContainText('groups:=food:cheese')
})
