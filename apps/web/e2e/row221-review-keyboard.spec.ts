import { expect, test, type Page, type Request } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCT_TYPE = 'product'
const ACCEPTED = 'Proposal already accepted'
const STALE = 'This proposal is stale and cannot be saved.'

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

async function openProposal(page: Page, proposalId: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /Review/ }).click()
  const review = page.getByTestId('proposal')
  await expect(review).toBeVisible()
  await expect(page.getByTestId(`proposal-row-${proposalId}`)).toBeVisible({ timeout: 30_000 })
  await page.getByTestId(`proposal-row-${proposalId}`).click()
  await expect(review.getByTestId('save-all')).toBeVisible()
  const pane = page.locator('section.pane', { has: review })
  await pane.locator('.toolbar strong').click()
  await expect(pane).toBeFocused()
  return review
}

/** Real Tab presses from the focused proposal pane. Never calls element.focus(). */
async function tabTo(page: Page, testId: string) {
  const target = page.getByTestId(testId)
  for (let step = 0; step < 40; step += 1) {
    if (await target.evaluate((node) => node === document.activeElement).catch(() => false)) return
    await page.keyboard.press('Tab')
  }
  await expect(target, `${testId} was not reached with Tab`).toBeFocused()
}

async function expectExplained(page: Page, testId: string, reason: string) {
  const button = page.getByTestId(testId)
  await expect(button).toBeFocused()
  await expect(button).toHaveAttribute('aria-disabled', 'true')
  await expect(button).toHaveAttribute('title', reason)
  const reasonId = await button.getAttribute('aria-describedby')
  expect(reasonId).toBeTruthy()
  const description = page.locator(`[id="${reasonId}"]`)
  await expect(description).toBeVisible()
  await expect(description).toHaveText(reason)
  await expect(button).toHaveAccessibleDescription(reason)
}

function watchMutations(page: Page) {
  const calls: string[] = []
  const onRequest = (request: Request) => {
    if (request.method() !== 'POST') return
    if (/\/v1\/proposals\/[^/]+\/(accept|discard)(?:\?|$)/.test(request.url())) {
      calls.push(`${request.method()} ${request.url()}`)
    }
  }
  page.on('request', onRequest)
  return {
    calls,
    stop() {
      page.off('request', onRequest)
    },
  }
}

function proposalSnapshot(body: { status?: unknown; stale?: unknown; title?: unknown; rows?: unknown }) {
  return { status: body.status, stale: body.stale ?? false, title: body.title, rows: body.rows }
}

function objectSnapshot(body: { version?: unknown; values?: unknown }) {
  return { version: body.version, values: body.values }
}

test('Tab reaches closed Save all and Discard all and keys do not change the proposal', async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now().toString().slice(-8)
  const key = `R221-${stamp}`
  const name = `Row221 ${stamp}`
  let product: { id: string; version: number } | null = null
  let proposalId = ''
  const mutations = watchMutations(page)
  try {
    await login(page)
    product = await createProduct(page, key, name)
    const created = await page.request.post('/v1/proposals', {
      data: {
        title: `Accepted ${stamp}`,
        rows: [
          {
            object_id: product.id,
            object_key: key,
            type_key: PRODUCT_TYPE,
            base_version: product.version,
            patch: { values: { name: { en: `${name} saved` } } },
          },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    proposalId = ((await created.json()) as { id: string }).id
    const accepted = await page.request.post(`/v1/proposals/${proposalId}/accept`, { data: {} })
    expect(accepted.ok(), await accepted.text()).toBeTruthy()
    const review = await openProposal(page, proposalId)
    await tabTo(page, 'save-all')
    await expectExplained(page, 'save-all', ACCEPTED)
    const proposalBefore = proposalSnapshot(await (await page.request.get(`/v1/proposals/${proposalId}`)).json())
    const objectBefore = objectSnapshot(await (await page.request.get(`/v1/objects/${product.id}`)).json())
    mutations.calls.length = 0
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(review.getByTestId('save-all')).toBeFocused()

    await tabTo(page, 'discard-all')
    await expectExplained(page, 'discard-all', ACCEPTED)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(review.getByTestId('discard-all')).toBeFocused()
    await expect(page.getByTestId('discard-all-confirm')).toHaveCount(0)

    expect(mutations.calls, 'Enter and Space must not accept or discard').toEqual([])
    const proposalAfter = proposalSnapshot(await (await page.request.get(`/v1/proposals/${proposalId}`)).json())
    const objectAfter = objectSnapshot(await (await page.request.get(`/v1/objects/${product.id}`)).json())
    expect(proposalAfter).toEqual(proposalBefore)
    expect(objectAfter).toEqual(objectBefore)
  } finally {
    mutations.stop()
    if (proposalId) await page.request.post(`/v1/proposals/${proposalId}/discard`).catch(() => undefined)
    if (product) await deleteProduct(page, product.id)
  }
})

/** The mock files an agent proposal for the selected row. A person's own proposal is not marked stale. */
async function fileAgentProposal(page: Page, key: string, objectId: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = page.locator('section.pane', { has: page.locator('.pane-tab', { hasText: /^Products/ }) }).first()
  await table.getByTestId('quick-filter').fill(key)
  const row = table.getByTestId('object-row').filter({ hasText: key })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.click()
  await page.keyboard.press('Control+k')
  await expect(page.getByTestId('command-palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('propose a new name')
  await page.keyboard.press('Control+j')
  await expect(page.getByTestId('command-palette')).toHaveCount(0)
  let proposalId = ''
  await expect.poll(async () => {
    const listed = await page.request.get('/v1/proposals?status=open&source=agent&limit=20')
    if (!listed.ok()) return ''
    const body = (await listed.json()) as { proposals?: Array<{ id: string }> }
    for (const item of body.proposals ?? []) {
      const detail = await page.request.get(`/v1/proposals/${item.id}`)
      if (!detail.ok()) continue
      const proposal = (await detail.json()) as { rows?: Array<{ object_id?: string }> }
      if (proposal.rows?.some((row) => row.object_id === objectId)) {
        proposalId = item.id
        return item.id
      }
    }
    return ''
  }, { timeout: 20_000 }).not.toBe('')
  return proposalId
}

test('Save all on a stale open proposal explains why it does nothing', async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now().toString().slice(-8)
  const key = `R221S-${stamp}`
  const name = `Row221 stale ${stamp}`
  let product: { id: string; version: number } | null = null
  let proposalId = ''
  const mutations = watchMutations(page)
  try {
    await login(page)
    product = await createProduct(page, key, name)
    proposalId = await fileAgentProposal(page, key, product.id)
    const edited = await page.request.patch(`/v1/objects/${product.id}`, {
      headers: { 'If-Match': String(product.version) },
      data: { values: { name: { en: `${name} edited` } } },
    })
    expect(edited.ok(), await edited.text()).toBeTruthy()
    const marked = await (await page.request.get(`/v1/proposals/${proposalId}`)).json()
    expect(marked.stale).toBe(true)

    const review = await openProposal(page, proposalId)
    await expect(review.getByTestId('proposal-stale')).toBeVisible()
    await tabTo(page, 'save-all')
    await expectExplained(page, 'save-all', STALE)
    const proposalBefore = proposalSnapshot(await (await page.request.get(`/v1/proposals/${proposalId}`)).json())
    const objectBefore = objectSnapshot(await (await page.request.get(`/v1/objects/${product.id}`)).json())
    mutations.calls.length = 0
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(review.getByTestId('discard-all')).not.toHaveAttribute('aria-disabled', 'true')
    await expect(review.getByTestId('discard-all')).toBeEnabled()

    expect(mutations.calls, 'a stale Save all must not accept or discard').toEqual([])
    const proposalAfter = proposalSnapshot(await (await page.request.get(`/v1/proposals/${proposalId}`)).json())
    const objectAfter = objectSnapshot(await (await page.request.get(`/v1/objects/${product.id}`)).json())
    expect(proposalAfter).toEqual(proposalBefore)
    expect(objectAfter).toEqual(objectBefore)
  } finally {
    mutations.stop()
    if (proposalId) await page.request.post(`/v1/proposals/${proposalId}/discard`).catch(() => undefined)
    if (product) await deleteProduct(page, product.id)
  }
})
