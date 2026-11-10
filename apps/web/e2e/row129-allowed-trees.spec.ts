import { expect, test, type APIResponse, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'

const shots = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row129-allowed-trees')
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

async function draft(page: Page) {
  const response = await page.request.get('/v1/model/draft')
  return (await response.json()) as { count?: number }
}

async function definitions(page: Page) {
  const response = await page.request.get('/v1/definitions')
  return (await response.json()) as {
    types?: Array<{ key?: string; structures?: string[] }>
    structures?: Array<{ id?: string; key?: string; groups?: Array<{ key?: string }> }>
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

test('an allowed-tree toggle reviews before it saves, and Cancel discards the draft', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString().slice(-6)
  const structureKey = `row129_${stamp}`
  const groupKey = `group_${stamp}`
  const label = `Row129 ${stamp}`
  let savePosts = 0
  let directPut = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/model/draft/save')) savePosts += 1
    if (request.method() === 'PUT' && /\/v1\/(types|structures)/.test(request.url())) directPut += 1
  })

  let baseline: string[] = []
  let loggedIn = false
  const cleanup = async () => {
    const current = await definitions(page)
    const ownedId = current.structures?.find((item) => item.key === structureKey)?.id
    if (ownedId && (await productStructures(page)).includes(ownedId)) {
      await page.request.post('/v1/model/draft/steps', {
        data: { operation: 'model.set_structures', args: { type_key: 'product', structures: baseline } },
      })
      await page.request.post('/v1/model/draft/save', { data: {} })
    }
    const removed = await page.request.post('/v1/operations/model.delete_structure', {
      data: { structure: structureKey },
    })
    const removedBody = await body(removed)
    const proposalId = removedBody.proposal_id ?? removedBody.id
    if (proposalId) {
      await page.request.post(`/v1/proposals/${proposalId}/accept`, { data: {} })
    }
    if (((await draft(page)).count ?? 0) > 0) {
      await page.request.delete('/v1/model/draft')
    }
  }

  try {
    await login(page)
    loggedIn = true
    const before = await draft(page)
    expect(before.count ?? 0).toBe(0)

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
    baseline = await productStructures(page)

    await openProductAttributes(page)
    const tree = page.getByTestId('allowed-trees')
    const checkbox = tree.getByRole('checkbox', { name: label })
    await expect(checkbox).not.toBeChecked()

    await checkbox.click()
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await expect(dialog.getByTestId('confirm-review')).toHaveText('Save')
    await expect(dialog.getByTestId('confirm-review')).not.toHaveClass(/btn-danger/)
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    expect(savePosts).toBe(0)
    expect(directPut).toBe(0)
    expect(await productStructures(page)).toEqual(baseline)
    await page.screenshot({ path: `${shots}/row129-01-review-dialog.png` })

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    expect(savePosts).toBe(0)
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)
    expect((await draft(page)).count ?? 0).toBe(0)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    await expect(page.getByTestId('allowed-trees').getByRole('checkbox', { name: label })).not.toBeChecked()
    expect(await productStructures(page)).toEqual(baseline)
    await page.screenshot({ path: `${shots}/row129-02-after-cancel-reload.png` })

    await page.getByTestId('allowed-trees').getByRole('checkbox', { name: label }).click()
    const again = page.getByTestId('review-dialog')
    await expect(again).toBeVisible({ timeout: 10_000 })
    const save = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await again.getByTestId('confirm-review').click()
    expect((await save).ok()).toBeTruthy()
    expect(savePosts).toBe(1)
    await expect(again).toHaveCount(0)
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    const keptCheckbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: label })
    await expect(keptCheckbox).toBeChecked()
    expect(await productStructures(page)).toContain(String(fixture?.id))
    await page.screenshot({ path: `${shots}/row129-03-after-save-reload.png` })

    await keptCheckbox.click()
    const restore = page.getByTestId('review-dialog')
    await expect(restore).toBeVisible({ timeout: 10_000 })
    const restoreSave = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await restore.getByTestId('confirm-review').click()
    expect((await restoreSave).ok()).toBeTruthy()
    await expect(restore).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    await expect(page.getByTestId('allowed-trees').getByRole('checkbox', { name: label })).not.toBeChecked()
    expect(await productStructures(page)).toEqual(baseline)
    await page.screenshot({ path: `${shots}/row129-04-restored.png` })

    await cleanup()
    const finalDraft = await draft(page)
    const finalStructures = await productStructures(page)
    const finalDefinitions = await definitions(page)
    expect(finalDraft.count ?? 0).toBe(0)
    expect(finalStructures).toEqual(baseline)
    expect(finalDefinitions.structures?.some((item) => item.key === structureKey)).toBe(false)
  } finally {
    if (loggedIn) {
      try {
        await cleanup()
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})
