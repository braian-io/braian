import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'

// Keep screenshots inside the checkout so CI runners can write them.
const shots = join(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row211-shots')
mkdirSync(shots, { recursive: true })

const PRODUCTS_TOKEN = 'braian-type-product'
// Copies made by this command, never the canonical Products workspace.
const COPY_NAME = /^Products \d+$/

type WorkspaceRow = { id: string; name: string; share_token?: string | null }
type WorkspaceDetail = {
  id: string
  name: string
  layout: unknown
  views: Array<{ id: string; type: string }>
}

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

async function listWorkspaces(page: Page): Promise<WorkspaceRow[]> {
  const listed = await page.request.get('/v1/workspaces')
  expect(listed.ok()).toBeTruthy()
  return ((await listed.json()) as { workspaces: WorkspaceRow[] }).workspaces
}

async function getWorkspace(page: Page, id: string): Promise<WorkspaceDetail> {
  const response = await page.request.get(`/v1/workspaces/${id}`)
  expect(response.ok()).toBeTruthy()
  return (await response.json()) as WorkspaceDetail
}

async function deleteWorkspace(page: Page, id: string) {
  const deleted = await page.request.delete(`/v1/workspaces/${id}`)
  expect(deleted.ok() || deleted.status() === 204).toBeTruthy()
}

async function removeCopyWorkspaces(page: Page) {
  for (const row of (await listWorkspaces(page)).filter((item) => COPY_NAME.test(item.name))) {
    await deleteWorkspace(page, row.id)
  }
}

async function openNewFromTemplate(page: Page) {
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill('New from template')
  await expect(palette.getByRole('option', { name: /^New from template/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(palette.locator('.crumb')).toContainText('New from template')
  return palette
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function chooseTemplate(page: Page, palette: Locator, name: string) {
  await palette.getByTestId('palette-input').fill(name)
  const option = palette.getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}`) })
  await expect(option).toBeVisible()
  return option
}

test('New from template on Products creates uniquely named copies and leaves the original', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  // Start from the canonical Products workspace only; copies from earlier runs are not originals.
  await removeCopyWorkspaces(page)
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })

  const before = await listWorkspaces(page)
  const original = before.find((row) => row.share_token === PRODUCTS_TOKEN)
  expect(original).toBeTruthy()
  const originalBefore = await getWorkspace(page, original!.id)
  expect(originalBefore.name).toBe('Products')

  const created: string[] = []
  try {
    const first = await openNewFromTemplate(page)
    const productsRow = first.getByRole('option', { name: /^Products/ })
    await expect(productsRow).toBeVisible()
    await expect(productsRow).toContainText(/Create ·/)
    await expect(productsRow).not.toContainText(/Open existing/)
    await first.screenshot({ path: `${shots}/row211-01-products-row-create.png` })
    await chooseTemplate(page, first, 'Products')
    await page.keyboard.press('Enter')
    await expect(first).toHaveCount(0)

    const products2Tab = page.locator('nav.tabs button.tab', { hasText: 'Products 2' })
    await expect(products2Tab).toBeVisible({ timeout: 30_000 })
    await expect(products2Tab).toHaveClass(/active/)
    await page.screenshot({ path: `${shots}/row211-02-products-2.png`, fullPage: true })

    let after = await listWorkspaces(page)
    const copy2 = after.find((row) => row.name === 'Products 2')
    expect(copy2).toBeTruthy()
    created.push(copy2!.id)
    expect(copy2!.share_token).toMatch(/^user-/)
    expect(after.filter((row) => row.share_token === PRODUCTS_TOKEN)).toHaveLength(1)

    const copy2Detail = await getWorkspace(page, copy2!.id)
    expect(copy2Detail.views.map((view) => view.type).sort()).toEqual(
      originalBefore.views.map((view) => view.type).sort(),
    )

    const second = await openNewFromTemplate(page)
    await chooseTemplate(page, second, 'Products')
    await page.keyboard.press('Enter')
    await expect(second).toHaveCount(0)

    const products3Tab = page.locator('nav.tabs button.tab', { hasText: 'Products 3' })
    await expect(products3Tab).toBeVisible({ timeout: 30_000 })
    await expect(products3Tab).toHaveClass(/active/)
    await page.screenshot({ path: `${shots}/row211-03-products-3.png`, fullPage: true })

    after = await listWorkspaces(page)
    const copy3 = after.find((row) => row.name === 'Products 3')
    expect(copy3).toBeTruthy()
    created.push(copy3!.id)
    expect(copy3!.share_token).toMatch(/^user-/)
    expect(after.some((row) => row.id === copy2!.id && row.name === 'Products 2')).toBe(true)
    expect(after.some((row) => row.id === original!.id && row.name === 'Products')).toBe(true)

    const originalAfter = await getWorkspace(page, original!.id)
    expect(originalAfter.name).toBe('Products')
    expect(originalAfter.layout).toEqual(originalBefore.layout)
  } finally {
    for (const id of created) {
      await deleteWorkspace(page, id)
    }
  }
})

test('Data model and Review keep opening their existing canonical workspace', async ({ page }) => {
  test.setTimeout(150_000)
  await login(page)

  const singletons: Array<[string, string]> = [
    ['Data model', 'braian-model'],
    ['Review', 'braian-review'],
  ]
  for (const [name, token] of singletons) {
    const before = await listWorkspaces(page)
    const beforeCount = before.length
    expect(before.filter((row) => row.share_token === token)).toHaveLength(1)

    // Focus another workspace so activation proves the palette reopened the singleton.
    await page.locator('nav.tabs button.tab', { hasText: 'Products' }).first().click()

    const palette = await openNewFromTemplate(page)
    const row = palette.getByRole('option', { name: new RegExp(`^${escapeRegExp(name)}`) })
    await expect(row).toContainText(/Open existing ·/)
    await palette.screenshot({
      path: `${shots}/row211-04-${name.toLowerCase().replace(/\s+/g, '-')}-open-existing.png`,
    })
    await chooseTemplate(page, palette, name)
    await page.keyboard.press('Enter')
    await expect(palette).toHaveCount(0)

    const tab = page.locator('nav.tabs button.tab', { hasText: name })
    await expect(tab).toHaveClass(/active/)

    const after = await listWorkspaces(page)
    expect(after.length).toBe(beforeCount)
    expect(after.filter((row) => row.share_token === token)).toHaveLength(1)
  }
})
