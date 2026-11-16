import { mainTable } from './ui'
import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { objectDisplayLabel, restoreTitle, versionAtSeq } from '../src/restore-proposal'

type ChangeRow = { seq?: number; version?: number }
type ProposalRow = { patch?: { _rollback_seq?: number } }
type ProposalBody = { proposals?: Array<{ id?: string; source?: string; status?: string }> }
type OpenProposal = { rows?: ProposalRow[] }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
  const filter = mainTable(page).getByTestId('quick-filter').first()
  if ((await filter.inputValue()) !== '') await filter.fill('')
  await expect(mainTable(page).getByTestId('object-row').first()).toBeVisible()
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
    // Best-effort cleanup after the spec fails or times out.
  }
}

async function restoreNumber(page: Page, objectId: string, original: string) {
  if (!objectId) return
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

async function restoreTitleForProposal(page: Page, objectId: string, proposal: OpenProposal): Promise<string> {
  const targetSeq = proposal.rows?.[0]?.patch?._rollback_seq
  const [objectRes, historyRes] = await Promise.all([
    page.request.get(`/v1/objects/${objectId}`),
    page.request.get(`/v1/objects/${objectId}/changes`),
  ])
  const objectBody = (await objectRes.json()) as { values?: Record<string, unknown> }
  const historyBody = await historyRes.json()
  const changes = (Array.isArray(historyBody)
    ? historyBody
    : (historyBody as { changes?: ChangeRow[] }).changes ?? []) as ChangeRow[]
  const version = versionAtSeq(changes as Parameters<typeof versionAtSeq>[0], targetSeq)
  return restoreTitle(objectDisplayLabel(objectBody.values, undefined), version)
}

test('restore dialog names the object, shows a diff, and hides empty impact rows', async ({ page }) => {
  const stamp = Date.now().toString().slice(-6)
  const number = `RST-${stamp}`
  let objectId = ''
  let original = ''
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    const row = mainTable(page).getByTestId('object-row').first()
    objectId = ((await row.getAttribute('id')) ?? '').replace(/^object-row-/, '')
    await row.click()
    await page.locator('[data-view-type="object_detail"]').first().click()

    const nummer = page.locator('[data-testid=object-detail] .field', { hasText: 'Number' }).locator('input')
    original = await nummer.inputValue()
    const next = `${original || number}-restored`
    await nummer.fill(next)
    await page.getByTestId('object-detail').getByTestId('review-and-save').click()
    await expect(page.getByTestId('activity-log')).toContainText('Saved')

    await page.getByRole('button', { name: 'History' }).click()
    const history = page.getByTestId('history')
    const changed = history.locator('article', { has: page.getByTestId('field-diff') }).first()
    await expect(changed).toBeVisible()
    await changed.click()
    await changed.getByTestId('rollback').click()

    const dialog = page.getByTestId('restore-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('confirm-restore')).toBeEnabled()
    const listed = await page.request.get('/v1/proposals?status=open&limit=200')
    const open = ((await listed.json()) as ProposalBody).proposals?.find((item) => item.source === 'rollback' && item.status === 'open')
    expect(open?.id).toBeTruthy()
    const proposalRes = await page.request.get(`/v1/proposals/${open!.id}`)
    const proposalBody = (await proposalRes.json()) as OpenProposal
    const expectedTitle = await restoreTitleForProposal(page, objectId, proposalBody)
    await expect(dialog.locator('strong')).toHaveText(expectedTitle)

    await expect(dialog.getByTestId('field-diff')).toBeVisible()
    await expect(dialog.getByTestId('field-diff')).toContainText('Number')
    await expect(dialog.getByTestId('field-diff').locator('.diff-old')).toContainText(next)
    await expect(dialog.getByTestId('field-diff').locator('.diff-new')).toContainText(original)

    await expect(dialog.getByTestId('impact-result')).toHaveCount(0)
    await expect(dialog).not.toContainText('No job reads these fields.')
    await expect(dialog).not.toContainText('Sample: —')
    await expect(dialog).not.toContainText('Affected')
    await expect(dialog.getByTestId('confirm-restore')).toBeFocused()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    await changed.click()
    await expect(changed.getByTestId('rollback')).toBeVisible()
    await changed.getByTestId('rollback').click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('confirm-restore')).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => {
      const proposals = await page.request.get('/v1/proposals?status=open&limit=200')
      const body = (await proposals.json()) as ProposalBody
      return (body.proposals ?? []).filter((item) => item.source === 'rollback').length
    }).toBe(0)
  } finally {
    if (loggedIn) await discardRollbackProposals(page)
    if (objectId) await restoreNumber(page, objectId, original)
  }
})