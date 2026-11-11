import { expect, test, type APIResponse, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

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
  const structureKey = `row129e_${stamp}`
  const groupKey = `group_${stamp}`
  const label = `Row129e ${stamp}`
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

async function createStructure(page: Page, label: string) {
  const stamp = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
  const structureKey = `row129e_del_${stamp}`
  const staged = await page.request.post('/v1/model/draft/steps', {
    data: { steps: [{ op: 'create_structure', key: structureKey, label }] },
  })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
  const current = await definitions(page)
  return { structureKey, label, id: String(current.structures?.find((item) => item.key === structureKey)?.id ?? '') }
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
    await page.request.post('/v1/model/draft/steps', {
      data: { operation: 'model.set_structures', args: { type_key: 'product', structures: fixture.baseline } },
    })
    await page.request.post('/v1/model/draft/save', { data: {} })
  }
  await deleteStructure(page, fixture.structureKey)
  await discardDraft(page)
}

async function cancelReview(page: Page) {
  const loading = page.getByTestId('review-loading')
  const dialog = page.getByTestId('review-dialog')
  if (await loading.isVisible().catch(() => false)) {
    await loading.getByRole('button', { name: 'Cancel' }).click()
  } else {
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
  }
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
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
}

test('real clicks and Space on the checkbox itself open exactly one review and Cancel reverts', async ({ page }) => {
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
    await expect(checkbox).not.toBeChecked()

    // Two real mouse clicks at the box centre, no artificial delay.
    let centre = await boxCentre(checkbox)
    await page.mouse.click(centre.x, centre.y)
    await page.mouse.click(centre.x, centre.y)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // Three real clicks in a row.
    centre = await boxCentre(checkbox)
    await page.mouse.click(centre.x, centre.y)
    await page.mouse.click(centre.x, centre.y)
    await page.mouse.click(centre.x, centre.y)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // Two clicks with a small gap, still inside the double-click burst.
    centre = await boxCentre(checkbox)
    await page.mouse.click(centre.x, centre.y)
    await page.waitForTimeout(80)
    await page.mouse.click(centre.x, centre.y)
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // A native double click on the box.
    await checkbox.click({ clickCount: 2 })
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // Space twice on the focused box.
    await checkbox.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('Space')
    await expectSingleReviewThenCancel(page, checkbox, fixture.baseline)

    // A single Space still works.
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

test('Esc, Cancel and X during the set_structures POST leave no dialog and no unsaved count', async ({ page }) => {
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

    await page.route('**/v1/model/draft/steps', async (route) => {
      let requestBody: { operation?: string; remove?: number } | undefined
      try {
        requestBody = route.request().postDataJSON() as { operation?: string; remove?: number }
      } catch {
        requestBody = undefined
      }
      if (requestBody?.operation === 'model.set_structures' && route.request().method() === 'POST') {
        await new Promise((resolve) => setTimeout(resolve, 2_500))
      }
      await route.continue().catch(() => undefined)
    })

    const dismiss = async (kind: 'Escape' | 'Cancel' | 'X') => {
      await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
      await expect(checkbox).not.toBeChecked({ timeout: 5_000 })
      await checkbox.click()
      const loading = page.getByTestId('review-loading')
      await expect(loading).toBeVisible({ timeout: 2_000 })
      if (kind === 'Escape') await page.keyboard.press('Escape')
      else if (kind === 'Cancel') await loading.getByRole('button', { name: 'Cancel' }).click()
      else await loading.getByRole('button', { name: 'Close' }).click()

      await expect(loading).toHaveCount(0)
      await expect(page.getByTestId('review-dialog')).toHaveCount(0)
      await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 2_000 })
      await expect(checkbox).not.toBeChecked({ timeout: 2_000 })

      // Wait past the delayed POST: the late response must not reopen or count.
      await page.waitForTimeout(3_000)
      await expect(page.getByTestId('review-loading')).toHaveCount(0)
      await expect(page.getByTestId('review-dialog')).toHaveCount(0)
      await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
      await expect(checkbox).not.toBeChecked()
      await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
      expect(await productStructures(page)).toEqual(fixture?.baseline)
    }

    for (const kind of ['Escape', 'Cancel', 'X'] as const) await dismiss(kind)
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

test('Save + F5 restores the selected Product row in Object types', async ({ page }) => {
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
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await dialog.getByTestId('confirm-review').click()
    expect((await saved).ok()).toBeTruthy()
    await expect(dialog).toHaveCount(0)
    expect(await productStructures(page)).toContain(fixture.id)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    const table = await openObjectTypes(page)
    const productRow = table.locator('[data-row-id="product"]')
    await expect(productRow).toBeVisible({ timeout: 30_000 })
    await expect(productRow).toHaveClass(/on/)
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

test('delete-structure dialog names the operation while loading, then drops the duplicate diff line', async ({ page }) => {
  test.setTimeout(300_000)
  let fixture: { structureKey: string; label: string; id: string } | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    const label = `Row129e delete ${Date.now().toString().slice(-6)}`
    fixture = await createStructure(page, label)
    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openDataModel(page)

    await page.route('**/v1/proposals/*', async (route) => {
      if (route.request().method() === 'GET') {
        await new Promise((resolve) => setTimeout(resolve, 2_500))
      }
      await route.continue().catch(() => undefined)
    })

    await page.getByTestId(`structure-menu-${fixture.structureKey}`).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: 20_000 })

    // While the proposal loads: the operation's own title, a disabled danger
    // confirm, and no invented affected/sample counts.
    await expect(dialog.locator('.consequence-title > strong')).toHaveText('Delete structure')
    await expect(dialog.getByTestId('confirm-delete')).toBeDisabled()
    await expect(dialog.getByTestId('impact-result')).toHaveCount(0)
    await expect(dialog).not.toContainText('Affected objects')
    await expect(dialog).not.toContainText('Sample:')
    await expect(dialog.getByTestId('model-diff')).toHaveCount(0)

    await expect(dialog.getByTestId('impact-result')).toBeVisible({ timeout: 20_000 })
    await expect(dialog.locator('.consequence-title > strong')).toHaveText(`Delete structure ${label}`)
    await expect(dialog.getByTestId('confirm-delete')).toBeEnabled()
    await expect(dialog.getByTestId('model-diff')).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => {
      const listed = await page.request.get('/v1/proposals?status=open&limit=200')
      const body = (await listed.json()) as { proposals?: Array<{ title?: string }> }
      return (body.proposals ?? []).filter((item) => item.title?.includes(label)).length
    }, { timeout: 15_000 }).toBe(0)
  } finally {
    if (loggedIn && fixture) {
      try {
        await discardOpenProposals(page)
        await discardDraft(page)
        await deleteStructure(page, fixture.structureKey)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('an unknown stored type key is cleared instead of shown as a title', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  await openDataModel(page)
  await page.evaluate(() => {
    localStorage.setItem('braian.modelSelection', JSON.stringify({ kind: 'type', typeKey: 'row129e_bogus_type' }))
  })
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('row129e_bogus_type')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('braian.modelSelection')), { timeout: 15_000 })
    .toBeNull()
})
