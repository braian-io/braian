import { expect, test, type Page, type Request } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type ProposalBody = { proposals?: Array<{ id?: string; source?: string; status?: string }> }
type ChangeRow = { seq?: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

function watchProposalPosts(page: Page) {
  const calls: string[] = []
  const onRequest = (request: Request) => {
    if (request.method() !== 'POST') return
    if (/\/v1\/proposals\/[^/]+\/(accept|discard)(?:\?|$)/.test(request.url())) {
      calls.push(request.url())
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

async function discardRollbackProposals(page: Page) {
  try {
    const listed = await page.request.get('/v1/proposals?status=open&limit=200')
    if (!listed.ok()) return
    const body = (await listed.json()) as ProposalBody
    for (const proposal of body.proposals ?? []) {
      if (proposal.source !== 'rollback' || !proposal.id) continue
      await page.request.post(`/v1/proposals/${proposal.id}/discard`, { data: {} }).catch(() => undefined)
    }
  } catch {
    // Best-effort cleanup.
  }
}

async function restoreNumber(page: Page, objectId: string, original: string) {
  if (!objectId || !original) return
  try {
    const current = await page.request.get(`/v1/objects/${objectId}`)
    if (!current.ok()) return
    const body = (await current.json()) as { version?: number }
    await page.request.patch(`/v1/objects/${objectId}`, {
      headers: { 'If-Match': String(body.version ?? 0) },
      data: { values: { number: original } },
    })
  } catch {
    // Leave the value as-is when cleanup cannot run.
  }
}

test('Review rollback survives Escape; busy accept ignores Escape', async ({ page }) => {
  const stamp = Date.now().toString().slice(-8)
  const key = `R262-${stamp}`
  const name = `Row262 ${stamp}`
  let objectId = ''
  let original = ''
  let rollbackId = ''
  let loggedIn = false
  const mutations = watchProposalPosts(page)
  try {
    await login(page)
    loggedIn = true

    const created = await page.request.post('/v1/objects', {
      data: {
        type: 'product',
        groups: { food: 'bread' },
        values: { number: key, name: { en: name }, status: 'draft' },
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const product = (await created.json()) as { id: string; version: number }
    objectId = product.id
    original = key

    const patched = await page.request.patch(`/v1/objects/${objectId}`, {
      headers: { 'If-Match': String(product.version) },
      data: { values: { number: `${key}-v2` } },
    })
    expect(patched.ok(), await patched.text()).toBeTruthy()
    const after = (await patched.json()) as { version: number }

    const historyRes = await page.request.get(`/v1/objects/${objectId}/changes`)
    expect(historyRes.ok(), await historyRes.text()).toBeTruthy()
    const historyBody = await historyRes.json()
    const changes = (Array.isArray(historyBody)
      ? historyBody
      : (historyBody as { changes?: ChangeRow[] }).changes ?? []) as ChangeRow[]
    const rollbackSeq = changes.find((row) => typeof row.seq === 'number')?.seq
    expect(rollbackSeq).toBeTruthy()

    const rolled = await page.request.post(`/v1/objects/${objectId}/rollback`, {
      data: { seq: rollbackSeq },
    })
    expect(rolled.ok(), await rolled.text()).toBeTruthy()
    rollbackId = String((await rolled.json() as { id?: string }).id ?? '')
    expect(rollbackId).toBeTruthy()

    await page.evaluate((id) => {
      window.__braianPublishProposal?.(id)
    }, rollbackId)

    const dialog = page.getByTestId('restore-dialog')
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => {
      const listed = await page.request.get('/v1/proposals?status=open&limit=200')
      const body = (await listed.json()) as ProposalBody
      return body.proposals?.some((item) => item.id === rollbackId && item.status === 'open')
    }).toBe(true)

    await discardRollbackProposals(page)
    mutations.calls.length = 0

    await mainTable(page).getByTestId('quick-filter').first().fill(key)
    const row = mainTable(page).locator(`#object-row-${objectId}`)
    await expect(row).toBeVisible()
    await row.click()
    await page.locator('[data-view-type="object_detail"]').first().click()
    const nummer = page.locator('[data-testid=object-detail] .field', { hasText: 'Number' }).locator('input')
    const live = await nummer.inputValue()
    await nummer.fill(`${live}-again`)
    await page.getByTestId('object-detail').getByTestId('review-and-save').click()
    await expect(page.getByTestId('activity-log')).toContainText('Saved')

    await page.getByRole('button', { name: 'History' }).click()
    const history = page.getByTestId('history')
    const changed = history.locator('article', { has: page.getByTestId('field-diff') }).first()
    await expect(changed).toBeVisible()
    await changed.click()
    await changed.getByTestId('rollback').click()
    await expect(dialog).toBeVisible()

    let acceptDelay = 1_500
    await page.route('**/v1/proposals/**/accept', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, acceptDelay))
      await route.continue()
    })

    await dialog.getByTestId('confirm-restore').click()
    await expect(dialog.getByTestId('confirm-restore')).toBeDisabled()
    await page.keyboard.press('Escape')
    expect(mutations.calls.filter((url) => url.includes('/discard'))).toEqual([])
    await expect(dialog).toBeVisible()
    acceptDelay = 0
    await page.unroute('**/v1/proposals/**/accept')
    await expect(dialog).toHaveCount(0, { timeout: 30_000 })
  } finally {
    mutations.stop()
    if (loggedIn) await discardRollbackProposals(page)
    if (objectId) await restoreNumber(page, objectId, original)
    if (objectId) {
      const latest = await page.request.get(`/v1/objects/${objectId}`)
      if (latest.ok()) {
        const body = (await latest.json()) as { version?: number }
        await page.request.delete(`/v1/objects/${objectId}`, {
          headers: { 'If-Match': String(body.version ?? 0) },
        }).catch(() => undefined)
      }
    }
  }
})