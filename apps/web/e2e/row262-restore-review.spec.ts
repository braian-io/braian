import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type ProposalBody = { proposals?: Array<{ id?: string; source?: string; status?: string }> }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
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

test('Review rollback uses the consequence dialog and accepts from there', async ({ page }) => {
  const stamp = Date.now().toString().slice(-8)
  const key = `R262-${stamp}`
  const name = `Row262 ${stamp}`
  let objectId = ''
  let rollbackId = ''
  let loggedIn = false
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

    const patched = await page.request.patch(`/v1/objects/${objectId}`, {
      headers: { 'If-Match': String(product.version) },
      data: { values: { number: `${key}-v2` } },
    })
    expect(patched.ok(), await patched.text()).toBeTruthy()

    const historyRes = await page.request.get(`/v1/objects/${objectId}/changes`)
    const historyBody = await historyRes.json()
    const changes = Array.isArray(historyBody) ? historyBody : []
    const rollbackSeq = changes.find((row: { seq?: number }) => typeof row.seq === 'number')?.seq
    expect(rollbackSeq).toBeTruthy()
    const rolled = await page.request.post(`/v1/objects/${objectId}/rollback`, {
      data: { seq: rollbackSeq },
    })
    expect(rolled.ok(), await rolled.text()).toBeTruthy()
    rollbackId = String((await rolled.json() as { id?: string }).id ?? '')

    await page.evaluate((id) => {
      window.__braianPublishProposal?.(id)
    }, rollbackId)

    const dialog = page.getByTestId('consequence')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('restore-dialog')).toHaveCount(0)
    await expect(dialog.getByTestId('field-diff')).toBeVisible()
    await expect(dialog.getByTestId('confirm-model')).toBeEnabled()
    await dialog.getByTestId('confirm-model').click()
    await expect(dialog).toHaveCount(0)
  } finally {
    if (loggedIn) await discardRollbackProposals(page)
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