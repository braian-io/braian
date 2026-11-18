import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCT_TYPE = 'product'
const stamp = Date.now().toString().slice(-8)
const KEY = `R221-${stamp}`
const NAME = `Row221 ${stamp}`

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function createProduct(page: Page, key: string, name: string) {
  const response = await page.request.post('/v1/objects', {
    data: {
      type: PRODUCT_TYPE,
      groups: { food: 'bread' },
      values: { number: key, name: { en: name }, status: 'draft' },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as { id: string; version: number }
}

async function deleteProduct(page: Page, id: string) {
  const latest = await page.request.get(`/v1/objects/${id}`)
  if (!latest.ok()) return
  const body = (await latest.json()) as { version?: number }
  await page.request.delete(`/v1/objects/${id}`, {
    headers: { 'If-Match': String(body.version ?? 0) },
  })
}

test('closed Review bulk actions explain on focus and the palette has no proposal preview', async ({ page }) => {
  test.setTimeout(120_000)
  let product: { id: string; version: number } | null = null
  let proposalId = ''
  try {
    await login(page)
    product = await createProduct(page, KEY, NAME)
    const created = await page.request.post('/v1/proposals', {
      data: {
        title: `Accepted ${stamp}`,
        rows: [
          {
            object_id: product.id,
            object_key: KEY,
            type_key: PRODUCT_TYPE,
            base_version: product.version,
            patch: { values: { name: { en: `${NAME} saved` } } },
          },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    proposalId = ((await created.json()) as { id: string }).id
    const accepted = await page.request.post(`/v1/proposals/${proposalId}/accept`, { data: {} })
    expect(accepted.ok(), await accepted.text()).toBeTruthy()

    await page.locator('nav.tabs').getByRole('button', { name: /Review/ }).click()
    const review = page.getByTestId('proposal')
    await expect(review).toBeVisible()
    await expect(page.getByTestId(`proposal-row-${proposalId}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`proposal-row-${proposalId}`).click()

    const save = review.getByTestId('save-all')
    await expect(save).toHaveAttribute('aria-disabled', 'true')
    await save.focus()
    await expect(save).toBeFocused()
    const reasonId = await save.getAttribute('aria-describedby')
    expect(reasonId).toBeTruthy()
    await expect(page.locator(`#${reasonId}`)).toHaveText('Proposal already accepted')
    await expect(save).toHaveAttribute('title', 'Proposal already accepted')

    await page.keyboard.press('Control+k')
    await expect(page.getByTestId('command-palette')).toBeVisible()
    await expect(page.getByTestId('palette-proposal')).toHaveCount(0)
  } finally {
    if (proposalId) await page.request.post(`/v1/proposals/${proposalId}/discard`).catch(() => undefined)
    if (product) await deleteProduct(page, product.id)
  }
})