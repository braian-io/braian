import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const PRODUCT_TYPE = 'product'

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
  return (await response.json()) as { id: string }
}

async function deleteProduct(page: Page, id: string) {
  const latest = await page.request.get(`/v1/objects/${id}`)
  if (!latest.ok()) return
  const body = (await latest.json()) as { version?: number }
  await page.request.delete(`/v1/objects/${id}`, {
    headers: { 'If-Match': String(body.version ?? 0) },
  })
}

async function memberIds(page: Page, selectionId: string) {
  const response = await page.request.get(`/v1/assortments/${selectionId}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { member_ids?: string[] }
  return body.member_ids ?? []
}

async function askAgent(page: Page, prompt: string) {
  await page.keyboard.press('Control+K')
  const palette = page.getByTestId('command-palette')
  await expect(palette).toBeVisible()
  await palette.getByTestId('palette-input').fill(prompt)
  await page.keyboard.press('Control+J')
  await expect(palette).toHaveCount(0)
}

test('named products become a selection proposal the person can approve or reject', async ({ page }) => {
  test.setTimeout(120_000)
  const stamp = Date.now().toString().slice(-8)
  const nameA = `Skyr ${stamp}`
  const nameB = `Feta ${stamp}`
  const missing = `NoSuch ${stamp}`
  const selectionName = `Cheese ${stamp}`
  let productA = ''
  let productB = ''
  let selectionId = ''
  let addProposal = ''
  let removeProposal = ''
  try {
    await login(page)
    const createdA = await createProduct(page, `SKY-${stamp}`, nameA)
    const createdB = await createProduct(page, `FET-${stamp}`, nameB)
    productA = createdA.id
    productB = createdB.id
    const saved = await page.request.post('/v1/assortments', {
      data: { name: selectionName, type: PRODUCT_TYPE, kind: 'manual', query: {} },
    })
    expect(saved.ok(), await saved.text()).toBeTruthy()
    selectionId = ((await saved.json()) as { id: string }).id

    const addSentence = `Lägg till ${nameA} och ${nameB} i selektionen ${selectionName}`
    await askAgent(page, addSentence)
    const log = page.getByTestId('agent-log')
    const addLink = page.getByTestId('agent-result-link').last()
    await expect(addLink).toContainText(selectionName, { timeout: 30_000 })
    await expect(addLink).toContainText(nameA)
    await expect(addLink).toContainText(nameB)
    await expect(addLink).toContainText('Add ')
    await expect(log).toContainText('Nothing changes until you approve')
    await expect(log).not.toContainText('returned no text')
    expect(await memberIds(page, selectionId)).toEqual([])

    await addLink.click()
    const review = page.getByTestId('proposal')
    await expect(review).toBeVisible()
    await expect(review).toContainText(`Add ${nameA}`)
    await expect(review).toContainText(nameB)
    await expect(review).toContainText(selectionName)
    const addRecord = await page.request.get('/v1/proposals?status=open&limit=50')
    expect(addRecord.ok(), await addRecord.text()).toBeTruthy()
    const open = (await addRecord.json()) as { proposals?: Array<{ id?: string; title?: string }> }
    addProposal = open.proposals?.find((item) => item.title?.includes(selectionName) && item.title?.startsWith('Add '))?.id ?? ''
    expect(addProposal).toBeTruthy()

    const accepted = page.waitForResponse(
      (response) => response.url().includes(`/v1/proposals/${addProposal}/accept`) && response.ok(),
    )
    await review.getByTestId('save-all').click()
    await accepted
    expect((await memberIds(page, selectionId)).slice().sort()).toEqual([productA, productB].sort())

    const removeSentence = `remove ${nameB} from selection ${selectionName}`
    await askAgent(page, removeSentence)
    const removeLink = page.getByTestId('agent-result-link').last()
    await expect(removeLink).toContainText(`Remove ${nameB}`, { timeout: 30_000 })
    await expect(removeLink).toContainText(selectionName)
    await expect(log).not.toContainText('returned no text')
    expect(await memberIds(page, selectionId)).toHaveLength(2)

    await removeLink.click()
    await expect(review).toContainText(`Remove ${nameB}`)
    const removeRecord = await page.request.get('/v1/proposals?status=open&limit=50')
    expect(removeRecord.ok(), await removeRecord.text()).toBeTruthy()
    const stillOpen = (await removeRecord.json()) as { proposals?: Array<{ id?: string; title?: string }> }
    removeProposal = stillOpen.proposals?.find((item) => item.title?.includes(`Remove ${nameB}`))?.id ?? ''
    expect(removeProposal).toBeTruthy()
    await review.getByTestId('discard-all').click()
    const discarded = page.waitForResponse(
      (response) => response.url().includes(`/v1/proposals/${removeProposal}/discard`) && response.ok(),
    )
    await page.getByTestId('confirm-discard-all').click()
    await discarded
    expect((await memberIds(page, selectionId)).slice().sort()).toEqual([productA, productB].sort())

    await askAgent(page, `add ${missing} to selection ${selectionName}`)
    await expect(log).toContainText(`No object named "${missing}".`, { timeout: 30_000 })
    await expect(log).not.toContainText('returned no text')
    expect((await memberIds(page, selectionId)).slice().sort()).toEqual([productA, productB].sort())
  } finally {
    if (addProposal) await page.request.post(`/v1/proposals/${addProposal}/discard`).catch(() => undefined)
    if (removeProposal) await page.request.post(`/v1/proposals/${removeProposal}/discard`).catch(() => undefined)
    if (selectionId) await page.request.delete(`/v1/assortments/${selectionId}`).catch(() => undefined)
    if (productA) await deleteProduct(page, productA)
    if (productB) await deleteProduct(page, productB)
  }
})
