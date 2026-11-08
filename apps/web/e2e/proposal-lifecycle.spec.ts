import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const PRODUCT_TYPE = 'product'
const stamp = Date.now().toString().slice(-8)
const KEY_A = `LIFE-A-${stamp}`
const KEY_B = `LIFE-B-${stamp}`
const NAME_A = `Lifecycle A ${stamp}`
const NAME_B = `Lifecycle B ${stamp}`
const SAVED_A = `Lifecycle A saved ${stamp}`
const PROPOSED_B = `Lifecycle B proposed ${stamp}`

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

async function filterTo(page: Page, text: string) {
  const table = mainTable(page)
  await table.getByTestId('quick-filter').first().fill(text)
}

function rowFor(page: Page, id: string) {
  return page.locator(`#object-row-${id}`)
}

async function proposalBody(page: Page, id: string) {
  const response = await page.request.get(`/v1/proposals/${id}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as {
    status?: string
    rows?: Array<{ id?: string; object_id?: string; status?: string }>
  }
}

async function objectName(page: Page, id: string) {
  const response = await page.request.get(`/v1/objects/${id}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { values?: { name?: Record<string, string> } }
  return body.values?.name?.en ?? ''
}

test('a scoped Save accepts only the visible row and the hidden row stays reviewable after reload', async ({ page }) => {
  test.setTimeout(180_000)
  let a: { id: string; version: number } | null = null
  let b: { id: string; version: number } | null = null
  let proposalId = ''
  try {
    await login(page)
    a = await createProduct(page, KEY_A, NAME_A)
    b = await createProduct(page, KEY_B, NAME_B)
    const created = await page.request.post('/v1/proposals', {
      data: {
        title: `Lifecycle ${stamp}`,
        rows: [
          {
            object_id: a.id,
            object_key: KEY_A,
            type_key: PRODUCT_TYPE,
            base_version: a.version,
            patch: { values: { name: { en: SAVED_A } } },
          },
          {
            object_id: b.id,
            object_key: KEY_B,
            type_key: PRODUCT_TYPE,
            base_version: b.version,
            patch: { values: { name: { en: PROPOSED_B } } },
          },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const proposal = (await created.json()) as { id: string }
    proposalId = proposal.id

    await openProducts(page)
    await filterTo(page, KEY_A)
    const visibleA = rowFor(page, a.id)
    await expect(visibleA).toBeVisible({ timeout: 30_000 })
    await expect(visibleA.getByTestId('cell-diff')).toBeVisible({ timeout: 30_000 })
    await expect(rowFor(page, b.id)).toHaveCount(0)

    await visibleA.click()
    const accepted = page.waitForResponse(
      (response) => response.url().includes(`/v1/proposals/${proposalId}/accept`) && response.ok(),
      { timeout: 30_000 },
    )
    await mainTable(page).getByTestId('review-and-save').click()
    await accepted
    await expect.poll(() => objectName(page, a!.id), { timeout: 30_000 }).toBe(SAVED_A)

    // A background accept must not reach the hidden row after the response.
    await page.waitForTimeout(8_000)
    expect(await objectName(page, b.id)).toBe(NAME_B)
    const after = await proposalBody(page, proposalId)
    expect(after.status, 'a hidden pending row must keep the proposal open').toBe('open')
    expect(after.rows?.find((row) => row.object_id === a!.id)?.status).toBe('accepted')
    expect(after.rows?.find((row) => row.object_id === b!.id)?.status).toBe('pending')

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    await openProducts(page)
    await filterTo(page, KEY_B)
    const visibleB = rowFor(page, b.id)
    await expect(visibleB).toBeVisible({ timeout: 30_000 })
    // The open-proposal projection must still show B's pending change.
    await expect(visibleB.getByTestId('cell-diff')).toBeVisible({ timeout: 30_000 })
    await expect(visibleB.getByTestId('suggestion-count')).toBeVisible()
    const openList = await page.request.get('/v1/proposals?status=open&limit=200')
    expect(openList.ok()).toBeTruthy()
    const listed = (await openList.json()) as { proposals?: Array<{ id?: string; status?: string }> }
    expect(listed.proposals?.some((item) => item.id === proposalId && item.status === 'open')).toBe(true)
    expect(await objectName(page, b.id)).toBe(NAME_B)
    expect(await objectName(page, a.id)).toBe(SAVED_A)
  } finally {
    if (proposalId) {
      await page.request.post(`/v1/proposals/${proposalId}/discard`).catch(() => undefined)
    }
    if (a) await deleteProduct(page, a.id)
    if (b) await deleteProduct(page, b.id)
  }
})
