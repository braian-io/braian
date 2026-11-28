import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, waitDetailReady } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
}

function products(page: Page) {
  return mainTable(page)
}

function rows(page: Page) {
  return products(page).getByTestId('object-row')
}

async function openProducts(page: Page) {
  await login(page)
  await expect(rows(page).first()).toBeVisible({ timeout: 60_000 })
  return products(page)
}

async function openProposalIds(page: Page) {
  const response = await page.request.get('/v1/proposals?status=open&limit=200')
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = await response.json() as { proposals?: Array<{ id?: string }> }
  return (body.proposals ?? []).map((item) => String(item.id ?? '')).filter(Boolean).sort()
}

async function objectBrand(page: Page, id: string) {
  const response = await page.request.get(`/v1/objects/${id}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = await response.json() as { values?: { brand?: string } }
  return body.values?.brand ?? ''
}

test('set a field on the selection, confirm, and undo it from History', async ({ page }) => {
  test.setTimeout(180_000)
  const table = await openProducts(page)
  const stamp = Date.now().toString().slice(-7)
  const prefix = `R327C-${stamp}`
  const next = `SetBrand-${stamp}`
  const created: string[] = []
  for (const suffix of ['A', 'B']) {
    const response = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'bread' },
        values: { number: `${prefix}-${suffix}`, name: { en: `${prefix}-${suffix}` }, status: 'draft', brand: 'Before' },
      },
    })
    expect(response.ok(), await response.text()).toBeTruthy()
    const body = await response.json() as { id: string }
    created.push(body.id)
  }

  const beforeProposals = await openProposalIds(page)
  const filter = table.getByTestId('quick-filter')
  await filter.fill(prefix)
  await expect(rows(page)).toHaveCount(2, { timeout: 60_000 })
  const list = rows(page)
  await list.nth(0).click()
  await list.nth(1).click({ modifiers: ['Shift'] })
  await expect(table.getByTestId('table-selection-bar')).toBeVisible()
  await expect(table.getByTestId('table-selection-set-field')).toBeVisible()

  await list.nth(0).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Set field' }).click()
  await expect(page.getByTestId('set-field-dialog')).toBeVisible()
  await page.getByTestId('set-field-attribute').selectOption({ label: 'Brand' })
  await page.getByTestId('set-field-value').fill(next)
  await page.getByTestId('set-field-apply').click()
  await expect(page.getByTestId('bulk-write-impact')).toHaveText(`Set Brand on 2 products?`)

  const cancel = page.getByTestId('bulk-write-confirm').getByRole('button', { name: 'Cancel' })
  await cancel.click()
  await expect(page.getByTestId('bulk-write-confirm')).toHaveCount(0)
  await expect(objectBrand(page, created[0]!)).resolves.toBe('Before')
  await expect(objectBrand(page, created[1]!)).resolves.toBe('Before')

  await page.getByTestId('set-field-apply').click()
  await expect(page.getByTestId('bulk-write-impact')).toHaveText(`Set Brand on 2 products?`)
  await page.getByTestId('bulk-write-confirm-button').click()
  await expect(page.getByTestId('set-field-dialog')).toHaveCount(0, { timeout: 60_000 })
  await expect(page.getByTestId('bulk-write-confirm')).toHaveCount(0)
  await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)

  await expect.poll(async () => openProposalIds(page)).toEqual(beforeProposals)
  for (const id of created) {
    await expect.poll(async () => objectBrand(page, id)).toBe(next)
    await expect(page.locator(`#object-row-${id} [data-column="brand"]`)).toHaveText(next, { timeout: 60_000 })
  }

  await page.locator(`#object-row-${created[0]}`).click()
  await waitDetailReady(page)
  const detailBrand = page.locator('[data-testid=object-detail] .field', { hasText: 'Brand' }).locator('input')
  await expect(detailBrand).toHaveValue(next)

  await page.reload()
  await expect(page.getByTestId('workspace')).toBeVisible({ timeout: 60_000 })
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await products(page).getByTestId('quick-filter').fill(prefix)
  await expect(rows(page)).toHaveCount(2, { timeout: 60_000 })
  await expect.poll(async () => objectBrand(page, created[0]!)).toBe(next)
  await expect(page.locator(`#object-row-${created[0]} [data-column="brand"]`)).toHaveText(next)

  await page.locator(`#object-row-${created[0]}`).click()
  await page.getByRole('button', { name: 'History' }).click()
  const history = page.getByTestId('history')
  const changed = history.locator('article').filter({ has: page.getByTestId('field-diff') }).first()
  await expect(changed).toBeVisible({ timeout: 60_000 })
  await expect(changed.getByTestId('field-diff')).toContainText('Brand')
  await expect(changed.locator('.diff-new')).toHaveText(next)
  await changed.getByTestId('rollback').click()
  await expect.poll(async () => objectBrand(page, created[0]!)).toBe('Before')

  await page.locator('.pane-tab[data-view-type="object_table"]').first().click()
  await products(page).getByTestId('quick-filter').fill(prefix)
  await expect(page.locator(`#object-row-${created[0]} [data-column="brand"]`)).toHaveText('Before', { timeout: 60_000 })
  await expect.poll(async () => objectBrand(page, created[1]!)).toBe(next)
})
