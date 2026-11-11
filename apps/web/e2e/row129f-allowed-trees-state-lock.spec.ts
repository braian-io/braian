import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

const shots =
  process.env.BRAIAN_ROW129F_SHOTS
  ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row129f-allowed-trees')

type DraftStep = { op?: string; type_key?: string; structures?: string[]; key?: string }
type Draft = { count?: number; steps?: DraftStep[] }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openObjectTypes(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  return page.getByTestId('object-types-table')
}

async function openProductAttributes(page: Page) {
  const table = await openObjectTypes(page)
  const typeRow = table.locator('[data-row-id="product"]')
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const attributes = page.getByTestId('attribute-table')
  await expect(attributes).toBeVisible()
  return attributes
}

async function openDataModel(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const structures = page.locator('.pane-tab').filter({ hasText: 'Structures' }).first()
  await expect(structures).toBeVisible({ timeout: 30_000 })
  await structures.click()
  await expect(page.getByTestId('structure-food')).toBeVisible({ timeout: 30_000 })
}

async function draft(page: Page): Promise<Draft> {
  const response = await page.request.get('/v1/model/draft')
  return (await response.json()) as Draft
}

async function definitions(page: Page) {
  const response = await page.request.get('/v1/definitions')
  return (await response.json()) as {
    types?: Array<{ key?: string; structures?: string[] }>
    structures?: Array<{ id?: string; key?: string; labels?: { en?: string }; groups?: Array<{ key?: string }> }>
  }
}

async function productStructures(page: Page) {
  const body = await definitions(page)
  return body.types?.find((type) => type.key === 'product')?.structures ?? []
}

async function body(response: APIResponse) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 500) }
  }
}

async function createFixture(page: Page) {
  const stamp = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
  const structureKey = `row129f_${stamp}`
  const groupKey = `group_${stamp}`
  const label = `Row129f ${stamp}`
  const staged = await page.request.post('/v1/model/draft/steps', {
    data: {
      steps: [
        { op: 'create_structure', key: structureKey, label },
        { op: 'create_group', structure: structureKey, group: groupKey, label: `${label} group` },
      ],
    },
  })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
  const afterSetup = await definitions(page)
  const fixture = afterSetup.structures?.find((item) => item.key === structureKey)
  expect(fixture?.groups?.some((group) => group.key === groupKey)).toBe(true)
  return { structureKey, groupKey, label, id: String(fixture?.id ?? ''), baseline: await productStructures(page) }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

async function setProductStructures(page: Page, structures: string[]) {
  const staged = await page.request.post('/v1/model/draft/steps', {
    data: { operation: 'model.set_structures', args: { type_key: 'product', structures } },
  })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
}

async function deleteStructure(page: Page, structureKey: string) {
  const current = await definitions(page)
  if (!current.structures?.some((item) => item.key === structureKey)) return
  const removed = await page.request.post('/v1/operations/model.delete_structure', {
    data: { structure: structureKey },
  })
  const removedBody = await body(removed)
  const proposalId = removedBody.proposal_id ?? removedBody.id
  if (proposalId) {
    await page.request.post(`/v1/proposals/${proposalId}/accept`, { data: {} })
  }
}

async function discardDraft(page: Page) {
  if (((await draft(page)).count ?? 0) > 0) await page.request.delete('/v1/model/draft')
}

async function discardOpenProposals(page: Page) {
  const listed = await page.request.get('/v1/proposals?status=open&limit=200')
  if (!listed.ok()) return
  const body = (await listed.json()) as { proposals?: Array<{ id?: string }> }
  for (const proposal of body.proposals ?? []) {
    if (proposal.id) await page.request.post(`/v1/proposals/${proposal.id}/discard`).catch(() => undefined)
  }
}

async function removeFixture(page: Page, fixture: Fixture) {
  const current = await definitions(page)
  const ownedId = current.structures?.find((item) => item.key === fixture.structureKey)?.id
  if (ownedId && (await productStructures(page)).includes(ownedId)) {
    await setProductStructures(page, fixture.baseline)
  }
  await deleteStructure(page, fixture.structureKey)
  await discardDraft(page)
}

async function cancelReview(page: Page) {
  // The loading shell can give way to the loaded dialog between the check and
  // the click. Resolve the Cancel button in whichever surface is on screen.
  const cancel = page.getByTestId('review-loading').getByRole('button', { name: 'Cancel' })
    .or(page.getByTestId('review-dialog').getByRole('button', { name: 'Cancel' }))
  await cancel.click({ timeout: 20_000 })
  await expect(page.getByTestId('review-loading')).toHaveCount(0)
  await expect(page.getByTestId('review-dialog')).toHaveCount(0)
}

async function expectSingleReviewThenCancel(page: Page, checkbox: Locator, baseline: string[]) {
  const dialog = page.getByTestId('review-dialog')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(checkbox).toBeChecked()
  const after = await draft(page)
  expect(after.count).toBe(1)
  const steps = (after.steps ?? []).filter((step) => step.op === 'set_structures' && step.type_key === 'product')
  expect(steps).toHaveLength(1)

  await cancelReview(page)
  await expect(checkbox).not.toBeChecked({ timeout: 2_000 })
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 2_000 })
  await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
  expect(await productStructures(page)).toEqual(baseline)
}

async function boxCentre(checkbox: Locator) {
  const box = await checkbox.boundingBox()
  expect(box).toBeTruthy()
  return { x: box!.x, y: box!.y, width: box!.width, height: box!.height }
}

test('state lock ignores centre, corner, label and keyboard toggles and Cancel reverts', async ({ page }) => {
  test.setTimeout(420_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    await openProductAttributes(page)
    const tree = page.getByTestId('allowed-trees')
    const label = tree.locator('label').filter({ hasText: fixture.label })
    const checkbox = label.locator("input[type='checkbox']")
    await expect(checkbox).not.toBeChecked()

    // Two real clicks at the box centre.
    let box = await boxCentre(checkbox)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // Three clicks in a row at the centre.
    box = await boxCentre(checkbox)
    for (let index = 0; index < 3; index += 1) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // Opposite corners of the same 16px box.
    box = await boxCentre(checkbox)
    await page.mouse.click(box.x + 1, box.y + 1)
    await page.mouse.click(box.x + box.width - 1, box.y + box.height - 1)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // The label, then the box.
    box = await boxCentre(checkbox)
    await label.click()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // The box, then the label. Use real coordinates: the review shell covers
    // the label, so a user's second click lands on the overlay, not the label.
    box = await boxCentre(checkbox)
    const labelBox = await label.boundingBox()
    expect(labelBox).toBeTruthy()
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.click(labelBox!.x + labelBox!.width / 2, labelBox!.y + labelBox!.height / 2)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // Keyboard Space twice, then Space followed by Enter, on the focused box.
    await checkbox.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)
    await checkbox.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // One Space still opens exactly one review.
    await checkbox.focus()
    await page.keyboard.press('Space')
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)
  } finally {
    if (loggedIn && fixture) {
      try {
        await discardOpenProposals(page)
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('delete-structure dialog says No values once, names Product, keeps the URL and leaves no Confirm footer', async ({ page }) => {
  test.setTimeout(300_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    // Product uses the fixture tree, so deleting it should mention the link.
    await setProductStructures(page, [...fixture.baseline, fixture.id])
    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openDataModel(page)

    await page.getByTestId(`structure-menu-${fixture.structureKey}`).click()
    const urlBefore = page.url()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const dialog = page.getByTestId('consequence')
    await expect(dialog).toBeVisible({ timeout: 20_000 })

    await expect(page).toHaveURL(urlBefore)
    await expect(dialog.getByTestId('delete-counts')).toHaveText('No values will be deleted')
    await expect(dialog).not.toContainText('0 values on 0 objects')
    await expect(dialog).not.toContainText('Affected objects: 0')
    await expect(dialog.getByTestId('allowed-trees-unlink')).toHaveText(
      'The Allowed trees link on Product is removed too.',
    )
    mkdirSync(shots, { recursive: true })
    await page.screenshot({ path: `${shots}/row129f-01-delete-dialog.png` })

    await expect(page.getByTestId('activity-log')).not.toContainText('Confirm')
    await page.getByTestId('confirm-delete').click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => {
      const current = await definitions(page)
      return current.structures?.some((item) => item.key === fixture?.structureKey) ?? false
    }, { timeout: 20_000 }).toBe(false)
    await expect(page.getByTestId('activity-log')).not.toContainText('Confirm')
    await expect(page.getByTestId('activity-log')).not.toContainText(/\d{1,2}:\d{2}\s+Confirm/)
  } finally {
    if (loggedIn && fixture) {
      try {
        await discardOpenProposals(page)
        await setProductStructures(page, fixture.baseline).catch(() => undefined)
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('focus ring after Esc is a double high-contrast ring', async ({ page }) => {
  test.setTimeout(300_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    await openProductAttributes(page)
    const checkbox = page.getByTestId('allowed-trees').locator('label').filter({ hasText: fixture.label }).locator("input[type='checkbox']")
    await checkbox.click()
    await expect(page.getByTestId('review-dialog')).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await expect(checkbox).not.toBeChecked({ timeout: 2_000 })
    await expect.poll(() => checkbox.evaluate((element) => element === document.activeElement)).toBe(true)

    const paint = await checkbox.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        outlineOffset: style.outlineOffset,
        boxShadow: style.boxShadow,
      }
    })
    expect(paint.outlineStyle).toBe('solid')
    expect(paint.outlineWidth).toBe('2px')
    expect(paint.outlineOffset).toBe('3px')
    expect(paint.boxShadow).toContain('3px')
    expect(paint.boxShadow).toContain('rgb(154, 77, 255)')
    mkdirSync(shots, { recursive: true })
    await page.screenshot({ path: `${shots}/row129f-02-focus-ring.png` })
  } finally {
    if (loggedIn && fixture) {
      try {
        await discardOpenProposals(page)
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})
