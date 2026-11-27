import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

const PRODUCT_TYPE = 'product'
const stamp = Date.now().toString().slice(-8)

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

async function objectName(page: Page, id: string) {
  const response = await page.request.get(`/v1/objects/${id}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { values?: { name?: Record<string, string> }; version?: number }
  return body
}

async function showProduct(page: Page, id: string, key: string) {
  await openProducts(page)
  const table = mainTable(page)
  await expect.poll(async () => {
    await table.getByTestId('quick-filter').first().fill(key)
    return page.locator(`#object-row-${id}`).count()
  }, { timeout: 20_000 }).toBe(1)
  await page.locator(`#object-row-${id}`).click()
  await page.locator('[data-view-type="object_detail"]').first().click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  return detail
}

function detailName(page: Page, detail: Locator) {
  return detail
    .locator('.field')
    .filter({ has: page.locator('label', { hasText: /^Name$/ }) })
    .first()
    .locator('.control input')
    .first()
}

async function expectNoConfirm(page: Page) {
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0)
  await expect(page.getByTestId('confirm-proposal')).toHaveCount(0)
  await expect(page.getByTestId('confirm-model')).toHaveCount(0)
  await expect(page.getByTestId('consequence')).toHaveCount(0)
}

async function mintToken(page: Page, kind: 'agent' | 'api', name: string) {
  const response = await page.request.post('/v1/tokens', { data: { name, kind } })
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { token?: string; kind?: string }
  expect(body.token, 'minted token').toBeTruthy()
  expect(body.kind).toBe(kind === 'agent' ? 'agent' : 'api')
  return body.token!
}

async function fileProposal(page: Page, id: string, version: number, name: string, token: string, source: string) {
  const response = await page.request.patch(`/v1/objects/${id}`, {
    headers: {
      authorization: `Bearer ${token}`,
      'If-Match': String(version),
    },
    data: { values: { name: { en: name } } },
  })
  expect(response.status(), await response.text()).toBe(202)
  const body = (await response.json()) as { proposal_id?: string; source?: string; needs_approval?: boolean }
  expect(body.needs_approval).toBe(true)
  expect(body.source).toBe(source)
  expect(body.proposal_id).toBeTruthy()
  return body.proposal_id!
}

test('a Detail edit commits on blur, survives reload, and writes history', async ({ page }) => {
  test.setTimeout(120_000)
  const key = `ROW57-${stamp}`
  const original = `Hazelnut ${stamp}`
  const edited = `${original} saved`
  let id = ''
  try {
    await login(page)
    const created = await createProduct(page, key, original)
    id = created.id
    const detail = await showProduct(page, id, key)
    const editor = detailName(page, detail)
    await expect(editor).toHaveValue(original)
    await editor.fill(edited)
    await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
    await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
    await expect(mainTable(page).getByTestId('review-and-save')).toHaveCount(0)
    await expect(mainTable(page).getByTestId('object-draft-bar')).toHaveCount(0)
    await expectNoConfirm(page)

    await editor.blur()
    await expectNoConfirm(page)
    await expect(detail.getByTestId('object-draft-bar')).toHaveCount(0)
    await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
    await expect(page.getByTestId('activity-log')).toContainText('Saved')
    await expect.poll(async () => (await objectName(page, id)).values?.name?.en ?? '', { timeout: 20_000 }).toBe(edited)

    await page.reload()
    const again = await showProduct(page, id, key)
    await expect(detailName(page, again)).toHaveValue(edited)
    await expect(again.getByTestId('review-and-save')).toHaveCount(0)
    await expect(mainTable(page).getByTestId('review-and-save')).toHaveCount(0)
    await expectNoConfirm(page)
    const saved = await objectName(page, id)
    expect(saved.version ?? 0).toBeGreaterThan(created.version)
    const changes = await page.request.get(`/v1/objects/${id}/changes`)
    expect(changes.ok(), await changes.text()).toBeTruthy()
    const history = (await changes.json()) as Array<{ version?: number; via?: string | null }>
    const committed = history.find((row) => row.version === saved.version)
    expect(committed, JSON.stringify(history)).toBeTruthy()
    expect(committed?.via ?? null).toBeNull()
  } finally {
    if (id) await deleteProduct(page, id)
  }
})

test('an agent proposal and an import proposal each save with one Save', async ({ page }) => {
  test.setTimeout(180_000)
  const agentKey = `ROW57A-${stamp}`
  const importKey = `ROW57I-${stamp}`
  const agentName = `Agent hazelnut ${stamp}`
  const importName = `Import hazelnut ${stamp}`
  let agentId = ''
  let importId = ''
  let agentProposal = ''
  let importProposal = ''
  try {
    await login(page)
    const agentProduct = await createProduct(page, agentKey, `Before agent ${stamp}`)
    const importProduct = await createProduct(page, importKey, `Before import ${stamp}`)
    agentId = agentProduct.id
    importId = importProduct.id
    const agentToken = await mintToken(page, 'agent', `row57-agent-${stamp}`)
    const importToken = await mintToken(page, 'api', `row57-import-${stamp}`)
    agentProposal = await fileProposal(page, agentId, agentProduct.version, agentName, agentToken, 'agent')
    importProposal = await fileProposal(page, importId, importProduct.version, importName, importToken, 'import')

    const agentRecord = await page.request.get(`/v1/proposals/${agentProposal}`)
    expect(agentRecord.ok(), await agentRecord.text()).toBeTruthy()
    expect(((await agentRecord.json()) as { source?: string }).source).toBe('agent')
    const importRecord = await page.request.get(`/v1/proposals/${importProposal}`)
    expect(importRecord.ok(), await importRecord.text()).toBeTruthy()
    expect(((await importRecord.json()) as { source?: string }).source).toBe('import')

    await page.reload()
    const agentDetail = await showProduct(page, agentId, agentKey)
    await expect(agentDetail.getByTestId('pending-field').filter({ hasText: agentName })).toBeVisible({ timeout: 20_000 })
    const agentSave = agentDetail.getByTestId('review-and-save')
    await expect(agentSave).toHaveText('Save')
    await expectNoConfirm(page)
    const accepted = page.waitForResponse(
      (response) => response.url().includes(`/v1/proposals/${agentProposal}/accept`) && response.ok(),
    )
    await agentSave.click()
    await accepted
    await expectNoConfirm(page)
    await expect.poll(async () => (await objectName(page, agentId)).values?.name?.en ?? '', { timeout: 20_000 }).toBe(agentName)
    const agentAfter = await page.request.get(`/v1/proposals/${agentProposal}`)
    expect(agentAfter.ok(), await agentAfter.text()).toBeTruthy()
    expect(((await agentAfter.json()) as { status?: string }).status).toBe('accepted')

    const importDetail = await showProduct(page, importId, importKey)
    await expect(importDetail.getByTestId('pending-field').filter({ hasText: importName })).toBeVisible({ timeout: 20_000 })
    const importSave = importDetail.getByTestId('review-and-save')
    await expect(importSave).toHaveText('Save')
    await expectNoConfirm(page)
    const imported = page.waitForResponse(
      (response) => response.url().includes(`/v1/proposals/${importProposal}/accept`) && response.ok(),
    )
    await importSave.click()
    await imported
    await expectNoConfirm(page)
    await expect.poll(async () => (await objectName(page, importId)).values?.name?.en ?? '', { timeout: 20_000 }).toBe(importName)
    const importAfter = await page.request.get(`/v1/proposals/${importProposal}`)
    expect(importAfter.ok(), await importAfter.text()).toBeTruthy()
    const importBody = (await importAfter.json()) as { status?: string; source?: string }
    expect(importBody.status).toBe('accepted')
    expect(importBody.source).toBe('import')
  } finally {
    if (agentProposal) await page.request.post(`/v1/proposals/${agentProposal}/discard`).catch(() => undefined)
    if (importProposal) await page.request.post(`/v1/proposals/${importProposal}/discard`).catch(() => undefined)
    if (agentId) await deleteProduct(page, agentId)
    if (importId) await deleteProduct(page, importId)
  }
})
