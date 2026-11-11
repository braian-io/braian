import { expect, test, type APIResponse, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'

const shots = process.env.BRAIAN_ROW129C_SHOTS
  ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row129c-allowed-trees')
mkdirSync(shots, { recursive: true })

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProductAttributes(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const objectTypes = page.locator('.pane-tab', { hasText: 'Object types' }).first()
  await expect(objectTypes).toBeVisible({ timeout: 30_000 })
  await objectTypes.click()
  const typeRow = page.getByTestId('object-types-table').locator('[data-row-id="product"]')
  await expect(async () => {
    await typeRow.click({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('.pane-tab', { hasText: 'Type attributes' }).first().click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  return table
}

async function openDataModel(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const structures = page.locator('.pane-tab').filter({ hasText: 'Structures' }).first()
  await expect(structures).toBeVisible({ timeout: 30_000 })
  await structures.click()
  await expect(page.getByTestId('structure-food')).toBeVisible({ timeout: 30_000 })
}

async function draft(page: Page) {
  const response = await page.request.get('/v1/model/draft')
  return (await response.json()) as {
    count?: number
    steps?: Array<{ op?: string; type_key?: string; structures?: string[] }>
  }
}

async function definitions(page: Page) {
  const response = await page.request.get('/v1/definitions')
  return (await response.json()) as {
    types?: Array<{ key?: string; singular?: { en?: string }; plural?: { en?: string }; structures?: string[] }>
    structures?: Array<{ id?: string; key?: string; labels?: { en?: string }; groups?: Array<{ key?: string }> }>
  }
}

async function productStructures(page: Page) {
  const body = await definitions(page)
  return body.types?.find((type) => type.key === 'product')?.structures ?? []
}

function pluralOf(page: Page) {
  return definitions(page).then((body) => {
    const article = body.types?.find((type) => type.key === 'article') ?? body.types?.find((type) => type.singular?.en === 'Article')
    return article?.plural?.en ?? ''
  })
}

function articleName(page: Page) {
  return definitions(page).then((body) => {
    const article = body.types?.find((type) => type.key === 'article') ?? body.types?.find((type) => type.singular?.en === 'Article')
    return article?.singular?.en ?? 'Article'
  })
}

function articleKey(page: Page) {
  return definitions(page).then((body) => {
    const article = body.types?.find((type) => type.key === 'article') ?? body.types?.find((type) => type.singular?.en === 'Article')
    return article?.key ?? 'article'
  })
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
  const structureKey = `row129c_${stamp}`
  const groupKey = `group_${stamp}`
  const label = `Row129c ${stamp}`
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

async function createStructure(page: Page, label: string) {
  const stamp = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
  const structureKey = `row129c_del_${stamp}`
  const staged = await page.request.post('/v1/model/draft/steps', {
    data: { steps: [{ op: 'create_structure', key: structureKey, label }] },
  })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
  const body = await definitions(page)
  const fixture = body.structures?.find((item) => item.key === structureKey)
  return { structureKey, label, id: String(fixture?.id ?? '') }
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

async function restoreArticle(page: Page, plural: string) {
  if (!plural || (await pluralOf(page)) === plural) return
  const key = await articleKey(page)
  const staged = await page.request.post('/v1/model/draft/steps', {
    data: { operation: 'model.update_type', args: { key, language: 'en', plural } },
  })
  expect(staged.ok(), await staged.text()).toBeTruthy()
  const saved = await page.request.post('/v1/model/draft/save', { data: {} })
  expect(saved.ok(), await saved.text()).toBeTruthy()
}

async function removeFixture(page: Page, structureKey: string, baseline: string[]) {
  const current = await definitions(page)
  const ownedId = current.structures?.find((item) => item.key === structureKey)?.id
  if (ownedId && (await productStructures(page)).includes(ownedId)) {
    await page.request.post('/v1/model/draft/steps', {
      data: { operation: 'model.set_structures', args: { type_key: 'product', structures: baseline } },
    })
    await page.request.post('/v1/model/draft/save', { data: {} })
  }
  await deleteStructure(page, structureKey)
  if (((await draft(page)).count ?? 0) > 0) {
    await page.request.delete('/v1/model/draft')
  }
}

async function discardDraft(page: Page) {
  if (((await draft(page)).count ?? 0) > 0) {
    await page.request.delete('/v1/model/draft')
  }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

test('the review lists an earlier unsaved step and saves only after one approval', async ({ page }) => {
  test.setTimeout(240_000)
  let savePosts = 0
  let directPut = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/model/draft/save')) savePosts += 1
    if (request.method() === 'PUT' && /\/v1\/(types|structures)/.test(request.url())) directPut += 1
  })

  let fixture: Fixture | undefined
  let originalPlural = ''
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    expect((await draft(page)).count ?? 0).toBe(0)
    originalPlural = await pluralOf(page)
    const article = await articleName(page)
    const articleKeyValue = await articleKey(page)

    fixture = await createFixture(page)
    const staged = await page.request.post('/v1/model/draft/steps', {
      data: { operation: 'model.update_type', args: { key: articleKeyValue, language: 'en', plural: 'ArticlesX' } },
    })
    expect(staged.ok(), await staged.text()).toBeTruthy()

    await openProductAttributes(page)
    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await expect(checkbox).not.toBeChecked()
    await checkbox.click()

    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    const steps = dialog.getByTestId('review-step')
    await expect(steps).toHaveCount(2)
    await expect(dialog.getByTestId('review-steps')).toContainText(`Set the plural name of ${article} to ArticlesX`)
    await expect(dialog.getByTestId('review-steps')).toContainText('Allowed trees for Product:')
    await expect(dialog.getByTestId('review-steps')).toContainText(fixture.label)
    await expect(steps.nth(1)).toHaveAttribute('data-highlight', 'true')
    await expect(dialog.getByTestId('review-steps')).not.toContainText(fixture.structureKey)
    expect(savePosts).toBe(0)
    expect(directPut).toBe(0)
    expect(await pluralOf(page)).toBe(originalPlural)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    await page.screenshot({ path: `${shots}/row129c-01-all-steps.png` })

    const saved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await dialog.getByTestId('confirm-review').click()
    expect((await saved).ok()).toBeTruthy()
    await expect(dialog).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    await expect(page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })).toBeChecked()
    expect(await pluralOf(page)).toBe('ArticlesX')
    expect(await productStructures(page)).toContain(fixture.id)
    await page.screenshot({ path: `${shots}/row129c-02-both-saved.png` })
  } finally {
    if (loggedIn) {
      try {
        await discardDraft(page)
        if (fixture) await removeFixture(page, fixture.structureKey, fixture.baseline)
        await restoreArticle(page, originalPlural)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('Cancel reverts the checkbox and the unsaved count before the remove request settles', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  let removeWaiting = false
  try {
    await login(page)
    loggedIn = true
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    await openProductAttributes(page)

    await page.route('**/v1/model/draft/steps', async (route) => {
      let requestBody: { remove?: number } | undefined
      try {
        requestBody = route.request().postDataJSON() as { remove?: number }
      } catch {
        requestBody = undefined
      }
      if (typeof requestBody?.remove !== 'number') {
        await route.continue()
        return
      }
      removeWaiting = true
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      removeWaiting = false
      await route.continue()
    })

    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await checkbox.click()
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(checkbox).not.toBeChecked({ timeout: 1_000 })
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 1_000 })
    expect(removeWaiting).toBe(true)
    await page.screenshot({ path: `${shots}/row129c-03-immediate-cancel.png` })

    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
  } finally {
    if (loggedIn && fixture) {
      try {
        await removeFixture(page, fixture.structureKey, fixture.baseline)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('Cancel keeps an earlier set_structures step on the same type', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  let deletes = 0
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && request.url().includes('/v1/model/draft')) deletes += 1
  })
  try {
    await login(page)
    loggedIn = true
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    const foreign = await page.request.post('/v1/model/draft/steps', {
      data: { operation: 'model.set_structures', args: { type_key: 'product', structures: fixture.baseline } },
    })
    expect(foreign.ok(), await foreign.text()).toBeTruthy()

    await openProductAttributes(page)
    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await expect(checkbox).not.toBeChecked()
    await checkbox.click()
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(1)
    const remaining = await draft(page)
    expect(remaining.steps).toHaveLength(1)
    expect(remaining.steps?.[0]?.op).toBe('set_structures')
    expect(remaining.steps?.[0]?.type_key).toBe('product')
    expect(remaining.steps?.[0]?.structures).toEqual(fixture.baseline)
    expect(deletes).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    await page.screenshot({ path: `${shots}/row129c-04-earlier-step-kept.png` })
  } finally {
    if (loggedIn && fixture) {
      try {
        await discardDraft(page)
        await removeFixture(page, fixture.structureKey, fixture.baseline)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('the attribute table fits Show by default and a long attribute name', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const table = await openProductAttributes(page)
  const header = table.locator('[data-column="showByDefault"]').first()
  await expect(header).toHaveAttribute('title', 'Show by default')
  expect(await header.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  const label = table.locator('[data-column="label"]').filter({ hasText: 'Country of origin' }).first()
  await expect(label).toHaveAttribute('title', 'Country of origin')
  expect(await label.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: `${shots}/row129c-06-columns-fit.png` })
})

test('deleting a structure shows its label in one confirmation and never its key', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: Awaited<ReturnType<typeof createStructure>> | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    expect((await draft(page)).count ?? 0).toBe(0)
    const label = `Row129c delete ${Date.now().toString().slice(-6)}`
    fixture = await createStructure(page, label)
    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openDataModel(page)

    const structure = page.getByTestId(`structure-${fixture.structureKey}`)
    await expect(structure).toBeVisible({ timeout: 20_000 })
    await page.getByTestId(`structure-menu-${fixture.structureKey}`).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()

    const dialogs = page.getByRole('dialog')
    await expect(dialogs).toHaveCount(1, { timeout: 20_000 })
    const dialog = dialogs.first()
    await expect(dialog).toContainText(`Delete structure ${label}`)
    await expect(dialog.getByTestId('model-diff')).toHaveText(`Delete structure ${label}`)
    await expect(dialog).not.toContainText(fixture.structureKey)
    await expect(page.getByTestId('structure-confirm')).toHaveCount(0)
    await expect(dialog.getByTestId('confirm-delete')).toBeVisible()
    await page.screenshot({ path: `${shots}/row129c-05-delete-label.png` })

    const accepted = page.waitForResponse((response) =>
      response.url().includes('/accept') && response.request().method() === 'POST')
    await dialog.getByTestId('confirm-delete').click()
    expect((await accepted).ok()).toBeTruthy()
    await expect(dialog).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openDataModel(page)
    await expect(page.getByTestId(`structure-${fixture.structureKey}`)).toHaveCount(0)
  } finally {
    if (loggedIn && fixture) {
      try {
        await discardDraft(page)
        await deleteStructure(page, fixture.structureKey)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})
