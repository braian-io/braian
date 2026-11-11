import { expect, test, type APIResponse, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demoCredentials } from './demo'

const shots = process.env.BRAIAN_ROW129D_SHOTS
  ?? resolve(dirname(fileURLToPath(import.meta.url)), '..', 'test-results', 'row129d-allowed-trees')
mkdirSync(shots, { recursive: true })

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
  const structureKey = `row129d_${stamp}`
  const groupKey = `group_${stamp}`
  const label = `Row129d ${stamp}`
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
  if (((await draft(page)).count ?? 0) > 0) {
    await page.request.delete('/v1/model/draft')
  }
}

async function discardDraft(page: Page) {
  if (((await draft(page)).count ?? 0) > 0) await page.request.delete('/v1/model/draft')
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

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

test('a rapid double click stages exactly one step and Cancel fully reverts it', async ({ page }) => {
  test.setTimeout(240_000)
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
    const checkbox = tree.getByRole('checkbox', { name: fixture.label })
    await expect(checkbox).not.toBeChecked()

    await checkbox.dblclick()
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(dialog.getByTestId('review-step')).toHaveCount(1)
    const after = await draft(page)
    expect(after.count).toBe(1)
    expect(after.steps).toHaveLength(1)
    expect(after.steps?.[0]?.op).toBe('set_structures')
    expect(after.steps?.[0]?.type_key).toBe('product')
    expect(after.steps?.[0]?.structures).toContain(fixture.id)
    // The dialog names the change once, and the lead is neutral.
    await expect(dialog.getByText(/Allowed trees for Product:/)).toHaveCount(1)
    await expect(dialog).not.toContainText(fixture.structureKey)
    await page.screenshot({ path: `${shots}/row129d-01-double-click-one-step.png` })

    await cancelReview(page)
    await expect(checkbox).not.toBeChecked({ timeout: 1_000 })
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 1_000 })
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
    await page.screenshot({ path: `${shots}/row129d-02-double-click-reverted.png` })

    // Two synchronous click events, the hardest case for the in-flight guard.
    await checkbox.evaluate((input) => {
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      input.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const again = page.getByTestId('review-dialog')
    await expect(again).toBeVisible({ timeout: 20_000 })
    await expect(again.getByTestId('review-step')).toHaveCount(1)
    const twoClicks = await draft(page)
    expect(twoClicks.count).toBe(1)
    expect(twoClicks.steps?.filter((step) => step.op === 'set_structures' && step.type_key === 'product')).toHaveLength(1)
    await cancelReview(page)
    await expect(checkbox).not.toBeChecked({ timeout: 1_000 })
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 1_000 })
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
  } finally {
    if (loggedIn && fixture) {
      try {
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('Esc, overlay, X and Cancel revert immediately and a parallel GET cannot flash the box back', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  let removeDelay = 1_500
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    await openProductAttributes(page)
    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })

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
      await new Promise((resolve) => setTimeout(resolve, removeDelay))
      await route.continue().catch(() => undefined)
    })
    await page.route('**/v1/model/draft', async (route) => {
      if (route.request().method() === 'GET') getDuringRemove += 1
      await route.continue()
    })

    const dismiss = async (kind: 'Escape' | 'overlay' | 'X' | 'Cancel') => {
      await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
      await expect(checkbox).not.toBeChecked({ timeout: 5_000 })
      await checkbox.click()
      const dialog = page.getByTestId('review-dialog')
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      if (kind === 'Escape') await page.keyboard.press('Escape')
      else if (kind === 'overlay') {
        // Row 129f locks the review by stage state, so an outside click is not
        // a dismissal while the structure step is pending. Cancel still is.
        await page.locator('.overlay').click({ position: { x: 10, y: 10 } })
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Cancel' }).click()
      } else if (kind === 'X') await dialog.getByRole('button', { name: 'Close' }).click()
      else await dialog.getByRole('button', { name: 'Cancel' }).click()

      await expect(dialog).toHaveCount(0)
      await expect(checkbox).not.toBeChecked({ timeout: 1_000 })
      await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 1_000 })
      await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
      expect(await productStructures(page)).toEqual(fixture?.baseline)
    }

    let getDuringRemove = 0
    for (const kind of ['Escape', 'overlay', 'X', 'Cancel'] as const) {
      await dismiss(kind)
    }

    // One more cancel, then force a draft refetch while the remove is delayed.
    await expect(checkbox).not.toBeChecked({ timeout: 5_000 })
    await checkbox.click()
    const dialog = page.getByTestId('review-dialog')
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    getDuringRemove = 0
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    const before = getDuringRemove
    await page.bringToFront()
    await page.evaluate(() => {
      try {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      } catch {
        // ignore a locked-down property
      }
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
    })
    await expect.poll(() => getDuringRemove, { timeout: 5_000 }).toBeGreaterThan(before)
    // The delayed remove is still in flight; the optimistic box and count hold.
    await page.waitForTimeout(600)
    await expect(checkbox).not.toBeChecked({ timeout: 1_000 })
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 1_000 })
    await page.screenshot({ path: `${shots}/row129d-03-parallel-get-no-flash.png` })
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
  } finally {
    if (loggedIn && fixture) {
      try {
        removeDelay = 0
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('the loading shell is usable at once and blocks the table behind it', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    const table = await openProductAttributes(page)
    const rows = table.locator('[data-row-id]')
    await expect(rows.first()).toBeVisible()
    await rows.first().click()
    const selectedId = await rows.first().getAttribute('data-row-id')
    const other = rows.nth(1)
    await expect(other).toBeVisible()
    const selected = table.locator(`[data-row-id="${selectedId}"]`)
    await expect(selected).toHaveClass(/on/)

    let delayed = true
    await page.route('**/v1/model/draft', async (route) => {
      if (delayed && route.request().method() === 'GET') {
        await new Promise((resolve) => setTimeout(resolve, 3_000))
      }
      await route.continue().catch(() => undefined)
    })

    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
    await checkbox.click()
    const loading = page.getByTestId('review-loading')
    await expect(loading).toBeVisible({ timeout: 1_000 })
    await expect(loading.getByText('Review change')).toBeVisible()
    await expect(loading.getByText('Loading the data model…')).toBeVisible()
    await expect(loading.getByRole('button', { name: 'Close' })).toBeVisible()
    await expect(loading.getByRole('button', { name: 'Cancel' })).toBeVisible()
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await page.screenshot({ path: `${shots}/row129d-04-loading-shell.png` })

    // A click on the overlay above a table row must hit the modal, not the row.
    // The centred dialog may cover some rows, so pick a point that really is
    // the overlay (elementFromPoint) before clicking.
    const point = await page.evaluate((skipId) => {
      for (const row of document.querySelectorAll<HTMLElement>('[data-testid="attribute-table"] [data-row-id]')) {
        if (row.getAttribute('data-row-id') === skipId) continue
        const rect = row.getBoundingClientRect()
        for (const x of [rect.left + 8, rect.left + 40, rect.right - 8]) {
          const y = rect.top + rect.height / 2
          const element = document.elementFromPoint(x, y)
          const classes = element?.getAttribute('class') ?? ''
          if (classes.split(/\s+/).includes('overlay')) {
            return { x, y, id: row.getAttribute('data-row-id') }
          }
        }
      }
      return null
    }, selectedId)
    expect(point).toBeTruthy()
    // Row 129f: the allowed-tree review is locked by stage state instead of a
    // click burst. An outside click no longer counts as Cancel; the change is
    // decided with Cancel, Save, X or Escape. The overlay still blocks the row.
    await page.mouse.click(point!.x, point!.y)
    await expect(page.getByTestId('review-loading').or(page.getByTestId('review-dialog'))).toBeVisible()
    // The modal marks the pane behind it aria-hidden, so read the box by CSS
    // rather than by its accessible name while the dialog is open.
    const boxed = page.locator("[data-testid='allowed-trees'] label").filter({ hasText: fixture.label }).locator("input[type='checkbox']")
    await expect(boxed).toBeChecked()
    await expect(selected).toHaveClass(/on/)
    await expect(table.locator(`[data-row-id="${point!.id}"]`)).not.toHaveClass(/on/)
    const cancel = page.getByTestId('review-loading').getByRole('button', { name: 'Cancel' })
      .or(page.getByTestId('review-dialog').getByRole('button', { name: 'Cancel' }))
    await cancel.click({ timeout: 20_000 })
    await expect(loading).toHaveCount(0)
    await expect(page.getByTestId('review-dialog')).toHaveCount(0)
    await expect(checkbox).not.toBeChecked({ timeout: 1_000 })
    await expect(page.getByTestId('unsaved-changes')).toHaveCount(0, { timeout: 1_000 })
    delayed = false
    await page.unroute('**/v1/model/draft')
    await expect.poll(async () => (await draft(page)).count ?? 0, { timeout: 15_000 }).toBe(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
  } finally {
    if (loggedIn && fixture) {
      try {
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('the delete-structure source chip never covers its title', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: { structureKey: string; label: string } | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    const stamp = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 90 + 10)}`
    const structureKey = `row129d_del_${stamp}`
    const label = `Row129d delete ${stamp}`
    const staged = await page.request.post('/v1/model/draft/steps', {
      data: { steps: [{ op: 'create_structure', key: structureKey, label }] },
    })
    expect(staged.ok(), await staged.text()).toBeTruthy()
    expect((await page.request.post('/v1/model/draft/save', { data: {} })).ok()).toBeTruthy()
    fixture = { structureKey, label }
    await page.reload()
    await expect(page.getByTestId('dock')).toBeVisible()
    await openDataModel(page)
    await page.getByTestId(`structure-menu-${structureKey}`).click()
    await page.getByRole('menuitem', { name: 'Delete…' }).click()
    const dialog = page.getByRole('dialog').first()
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(dialog).toContainText(`Delete structure ${label}`)
    const titleBox = await dialog.locator('.consequence-title > strong').boundingBox()
    const chip = dialog.getByTestId('proposal-source')
    expect(titleBox).toBeTruthy()
    const chipCount = await chip.count()
    if (chipCount > 0) {
      const chipBox = await chip.boundingBox()
      expect(chipBox).toBeTruthy()
      const overlaps = !(chipBox!.x >= titleBox!.x + titleBox!.width
        || chipBox!.x + chipBox!.width <= titleBox!.x
        || chipBox!.y >= titleBox!.y + titleBox!.height
        || chipBox!.y + chipBox!.height <= titleBox!.y)
      expect(overlaps).toBe(false)
    }
    await page.screenshot({ path: `${shots}/row129d-05-delete-chip.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  } finally {
    if (loggedIn && fixture) {
      try {
        if (((await draft(page)).count ?? 0) > 0) await page.request.delete('/v1/model/draft')
        await deleteStructure(page, fixture.structureKey)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})

test('the selected object type survives Save + F5 and still shows its attributes', async ({ page }) => {
  test.setTimeout(240_000)
  let fixture: Fixture | undefined
  let loggedIn = false
  try {
    await login(page)
    loggedIn = true
    await discardDraft(page)
    expect((await draft(page)).count ?? 0).toBe(0)
    fixture = await createFixture(page)
    await openProductAttributes(page)
    await expect(page.locator('.attr-title')).toHaveText('Product')
    const checkbox = page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })
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
    await expect(page.getByTestId('attribute-table')).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.attr-title').first()).toHaveText('Product')
    await expect(page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label })).toBeChecked()
    await page.screenshot({ path: `${shots}/row129d-06-selection-after-reload.png` })

    // Restore the allowed trees through the same review flow.
    await page.getByTestId('allowed-trees').getByRole('checkbox', { name: fixture.label }).click()
    const restore = page.getByTestId('review-dialog')
    await expect(restore).toBeVisible({ timeout: 20_000 })
    const restoreSaved = page.waitForResponse((response) =>
      response.url().includes('/v1/model/draft/save') && response.request().method() === 'POST')
    await restore.getByTestId('confirm-review').click()
    expect((await restoreSaved).ok()).toBeTruthy()
    await expect(restore).toHaveCount(0)
    expect(await productStructures(page)).toEqual(fixture.baseline)
  } finally {
    if (loggedIn && fixture) {
      try {
        await removeFixture(page, fixture)
      } catch (error) {
        console.error('cleanup failed:', error)
      }
    }
  }
})


test('the attribute table shows full key titles and keeps every header readable', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const table = await openProductAttributes(page)
  const keyCell = table.locator('[data-column="key"]').filter({ hasText: 'country_of_origin' }).first()
  await expect(keyCell).toHaveAttribute('title', 'country_of_origin')
  const keyText = keyCell.locator('span').last()
  expect(await keyText.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)

  const headers = table.locator('[role="columnheader"]')
  const count = await headers.count()
  expect(count).toBeGreaterThan(5)
  for (let index = 0; index < count; index += 1) {
    const header = headers.nth(index)
    const label = (await header.textContent()) ?? ''
    await expect(header).toHaveAttribute('title', label)
    expect(
      await header.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
      `header ${label} is not clipped`,
    ).toBe(true)
  }

  // The last header must be reachable and fully inside the scroll container,
  // not cut off by the pane edge.
  const last = headers.nth(count - 1)
  await last.scrollIntoViewIfNeeded()
  const visible = await last.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const grid = node.closest('[role="grid"]')?.getBoundingClientRect()
    return Boolean(grid && box.left >= grid.left - 1 && box.right <= grid.right + 1)
  })
  expect(visible).toBe(true)
  await page.screenshot({ path: `${shots}/row129d-07-attribute-columns.png` })
})
