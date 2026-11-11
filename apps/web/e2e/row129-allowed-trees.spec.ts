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
  return (await response.json()) as { count?: number; steps?: Array<{ op?: string; key?: string }> }
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

async function createFixture(page: Page) {
  const stamp = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
  const structureKey = `row129_${stamp}`
  const groupKey = `group_${stamp}`
  const label = `Row129 ${stamp}`
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
  const baseline = await productStructures(page)
  return { structureKey, groupKey, label, id: String(fixture?.id ?? ''), baseline }
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

type Fixture = Awaited<ReturnType<typeof createFixture>>

test('an allowed-tree toggle reviews before it saves, and Cancel discards only that change', async ({ page }) => {
  test.setTimeout(240_000)
  let savePosts = 0
  let directPut = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/v1/model/draft/save')) savePosts += 1
    if (request.method() === 'PUT' && /\/v1\/(types|structures)/.test(request.url())) directPut += 1
  })

  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    expect((await draft(page)).count ?? 0).toBe(0)

    fixture = await createFixture(page)
    const table = await openProductAttributes(page)
    const tree = page.getByTestId('allowed-trees')
    const checkbox = tree.getByRole('checkbox', { name: fixture.label })
    await expect(checkbox).not.toBeChecked()

    const layout = await checkbox.evaluate((input) => {
      const label = input.closest('label') as HTMLLabelElement | null
      const box = (element: Element | null) => {
        const rect = element?.getBoundingClientRect()
        return rect
          ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
          : null
      }
      const text = label?.lastChild
      let textBox = null
      if (text) {
        const range = document.createRange()
        range.selectNodeContents(text)
        const rect = range.getBoundingClientRect()
        textBox = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
      }
      return { input: box(input), label: box(label), text: textBox }
    })
    const tableBox = await table.getByRole('checkbox').first().boundingBox()
    expect(tableBox).toBeTruthy()
    expect(layout.input).toBeTruthy()
    expect(layout.label).toBeTruthy()
    expect(layout.text).toBeTruthy()
    expect(Math.abs((layout.input?.width ?? 0) - (tableBox?.width ?? 0))).toBeLessThanOrEqual(0.5)
    expect(Math.abs((layout.input?.height ?? 0) - (tableBox?.height ?? 0))).toBeLessThanOrEqual(0.5)
    expect(layout.text?.left ?? 0).toBeGreaterThanOrEqual((layout.input?.right ?? 0) - 0.5)
    expect(layout.text?.top ?? 0).toBeLessThan(layout.input?.bottom ?? 0)
    expect(layout.label?.height ?? 999).toBeLessThan((layout.input?.height ?? 0) + 10)
    await page.screenshot({ path: `${shots}/row129-00-allowed-trees-layout.png` })

    let delayDraft = true
    await page.route('**/v1/model/draft', async (route) => {
      if (delayDraft && route.request().method() === 'GET') {
        await new Promise((resolve) => setTimeout(resolve, 1_200))
      }
      await route.continue()
    })
    await checkbox.click()
    await expect(page.getByTestId('review-loading')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await page.screenshot({ path: `${shots}/row129-05-review-loading.png` })

    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    delayDraft = false
    await page.unroute('**/v1/model/draft')
    const review = await dialog.evaluate((element) => {
      const text = (id: string | null) => id ? document.getElementById(id)?.textContent ?? '' : ''
      return {
        title: text(element.getAttribute('aria-labelledby')),
        description: text(element.getAttribute('aria-describedby')),
      }
    })
    expect(review.title).toBe('Review change')
    // The highlighted step already names the trees. The description is neutral.
    expect(review.description).toBe('Review the change before it is saved.')
    await expect(dialog.getByTestId('review-steps').getByText(/Allowed trees for Product:/)).toHaveCount(1)
    expect(review.description).not.toContain(fixture.structureKey)
    expect(review.description).not.toContain('product')
    await expect(dialog.getByTestId('confirm-review')).toHaveText('Save')
    await expect(dialog.getByTestId('confirm-review')).not.toHaveClass(/btn-danger/)
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByTestId('review-save')).toBeDisabled()
    await expect(page.getByTestId('discard-draft')).toBeDisabled()
    expect(savePosts).toBe(0)
    expect(directPut).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    await page.screenshot({ path: `${shots}/row129-01-review-dialog.png` })

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 10_000 }).toBe(0)
    expect(savePosts).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    const readFocus = () => page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const outlineWidth = Number.parseFloat(style.outlineWidth) || 0
      const outlineOffset = Number.parseFloat(style.outlineOffset) || 0
      return {
        tag: element.tagName,
        type: (element as HTMLInputElement).type,
        inAllowedTrees: Boolean(element.closest('[data-testid="allowed-trees"]')),
        ringWidth: rect.width + 2 * outlineWidth + 2 * outlineOffset,
        ringHeight: rect.height + 2 * outlineWidth + 2 * outlineOffset,
        outlineWidth,
        outlineOffset,
      }
    })
    await expect.poll(async () => (await readFocus())?.inAllowedTrees, { timeout: 5_000 }).toBe(true)
    const focus = await readFocus()
    expect(focus?.inAllowedTrees, JSON.stringify(focus)).toBe(true)
    expect(focus?.tag).toBe('INPUT')
    expect(focus?.type).toBe('checkbox')
    expect(focus?.ringWidth ?? 999).toBeLessThan(40)
    expect(focus?.ringHeight ?? 999).toBeLessThan(40)
    await page.screenshot({ path: `${shots}/row129-03-focus-after-esc.png` })

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    const cancelCheckbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await expect(cancelCheckbox).not.toBeChecked()
    await cancelCheckbox.click()
    const cancelDialog = page.getByTestId('review-dialog')
    await expect(cancelDialog).toBeVisible({ timeout: 15_000 })
    await cancelDialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(cancelDialog).toHaveCount(0)
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 10_000 }).toBe(0)
    expect(savePosts).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    const saveCheckbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await expect(saveCheckbox).not.toBeChecked()
    await saveCheckbox.click()
    const again = page.getByTestId('review-dialog')
    await expect(again).toBeVisible({ timeout: 15_000 })
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
    const keptCheckbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await expect(keptCheckbox).toBeChecked()
    expect(await productStructures(page)).toContain(fixture.id)
    await page.screenshot({ path: `${shots}/row129-04-after-save-reload.png` })

    await keptCheckbox.click()
    const restore = page.getByTestId('review-dialog')
    await expect(restore).toBeVisible({ timeout: 15_000 })
    const restoreSave = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await restore.getByTestId('confirm-review').click()
    expect((await restoreSave).ok()).toBeTruthy()
    await expect(restore).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openProductAttributes(page)
    await expect(page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })).not.toBeChecked()
    expect(await productStructures(page)).toEqual(fixture.baseline)
    await page.screenshot({ path: `${shots}/row129-07-restored.png` })

    await removeFixture(page, fixture.structureKey, fixture.baseline)
    expect((await draft(page)).count ?? 0).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    expect((await definitions(page)).structures?.some((item) => item.key === fixture?.structureKey)).toBe(false)
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

test('overlay dismiss reverts only the allowed-tree step and keeps unrelated draft work', async ({ page }) => {
  test.setTimeout(180_000)
  const unrelatedKey = `unrelated_${Date.now().toString().slice(-6)}`
  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    expect((await draft(page)).count ?? 0).toBe(0)

    fixture = await createFixture(page)
    const staged = await page.request.post('/v1/model/draft/steps', {
      data: { operation: 'model.create_type', args: { key: unrelatedKey, label: 'Unrelated row129' } },
    })
    expect(staged.ok(), await staged.text()).toBeTruthy()

    await openProductAttributes(page)
    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await checkbox.click()
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('review-save')).toBeDisabled()
    await expect(page.getByTestId('discard-draft')).toBeDisabled()

    await page.locator('.overlay').click({ position: { x: 10, y: 10 } })
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 10_000 }).toBe(1)
    const remaining = await draft(page)
    expect(remaining.steps).toHaveLength(1)
    expect(remaining.steps?.[0]?.op).toBe('create_type')
    expect(remaining.steps?.[0]?.key).toBe(unrelatedKey)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    await expect(page.getByTestId('unsaved-changes')).toBeVisible()
    await page.screenshot({ path: `${shots}/row129-06-overlay-revert-kept-draft.png` })
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
