import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, setTheme } from './ui'

const PRODUCT_TYPE = 'product'
const stamp = Date.now().toString().slice(-8)
const KEY_A = `LIFE-A-${stamp}`
const KEY_B = `LIFE-B-${stamp}`
const KEY_C = `LIFE-C-${stamp}`
const KEY_D = `LIFE-D-${stamp}`
const KEY_E = `LIFE-E-${stamp}`
const KEY_F = `LIFE-F-${stamp}`
const NAME_A = `Lifecycle A ${stamp}`
const NAME_B = `Lifecycle B ${stamp}`
const NAME_C = `Lifecycle C ${stamp}`
const NAME_D = `Lifecycle D ${stamp}`
const NAME_E = `Lifecycle E ${stamp}`
const NAME_F = `Lifecycle F ${stamp}`
const SAVED_A = `Lifecycle A saved ${stamp}`
const PROPOSED_B = `Lifecycle B proposed ${stamp}`
const SAVED_C = `Lifecycle C saved ${stamp}`
const SAVED_E = `Lifecycle E saved ${stamp}`
const PROPOSED_D = `Lifecycle D proposed ${stamp}`
const PROPOSED_F = `Lifecycle F proposed ${stamp}`

const shots = process.env.BRAIAN_SHOTS_DIR

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

async function filterTo(page: Page, text: string) {
  const table = mainTable(page)
  await table.getByTestId('quick-filter').first().fill(text)
}

function rowFor(page: Page, id: string) {
  return page.locator(`#object-row-${id}`)
}

const ENABLED_DANGER = ['rgb(251, 113, 133)', 'rgb(192, 35, 62)']

async function actionPaint(page: Page) {
  return page.getByTestId('proposal').evaluate(() => {
    const read = (id: string) => {
      const node = document.querySelector(`[data-testid="${id}"]`)
      if (!(node instanceof HTMLElement)) throw new Error(`missing ${id}`)
      const style = getComputedStyle(node)
      return {
        opacity: Number(style.opacity || 1),
        background: style.backgroundColor,
        color: style.color,
      }
    }
    return { save: read('save-all'), discard: read('discard-all') }
  })
}

async function expectClosedActions(page: Page, reason: string, shot?: string) {
  const review = page.getByTestId('proposal')
  const save = review.getByTestId('save-all')
  const discard = review.getByTestId('discard-all')
  await expect(save).toBeDisabled()
  await expect(discard).toBeDisabled()
  const paint = await actionPaint(page)
  expect(paint.save.opacity, 'Save all must not look active').toBeLessThan(1)
  expect(paint.discard.opacity, 'Discard all must not look active').toBeLessThan(1)
  expect(ENABLED_DANGER, 'Discard all must not keep the enabled danger fill').not.toContain(paint.discard.background)
  const explanation = review.getByTestId('proposal-actions-reason')
  await expect(explanation).toHaveText(reason)
  await expect(explanation).toHaveAttribute('title', reason)
  const id = await explanation.getAttribute('id')
  expect(id).toBeTruthy()
  await expect(save).toHaveAttribute('aria-describedby', id!)
  await expect(discard).toHaveAttribute('aria-describedby', id!)
  if (shot && shots) {
    await review.locator('.toolbar').first().screenshot({ path: `${shots}/${shot}` })
  }
}

async function expectPendingActions(page: Page) {
  const review = page.getByTestId('proposal')
  const save = review.getByTestId('save-all')
  const discard = review.getByTestId('discard-all')
  await expect(save).toBeEnabled()
  await expect(discard).toBeEnabled()
  const paint = await actionPaint(page)
  expect(paint.save.opacity).toBe(1)
  expect(paint.discard.opacity).toBe(1)
  await expect(review.getByTestId('proposal-actions-reason')).toHaveCount(0)
  expect(await save.getAttribute('aria-describedby')).toBeNull()
  expect(await discard.getAttribute('aria-describedby')).toBeNull()
}

async function proposalBody(page: Page, id: string) {
  const response = await page.request.get(`/v1/proposals/${id}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  return (await response.json()) as {
    status?: string
    rows?: Array<{ id?: string; object_id?: string; status?: string }>
  }
}

async function objectName(page: Page, id: string) {
  const response = await page.request.get(`/v1/objects/${id}`)
  expect(response.ok(), await response.text()).toBeTruthy()
  const body = (await response.json()) as { values?: { name?: Record<string, string> } }
  return body.values?.name?.en ?? ''
}

test('a scoped Save accepts only the visible row and the hidden row stays reviewable after reload', async ({ page }) => {
  test.setTimeout(180_000)
  let a: { id: string; version: number } | null = null
  let b: { id: string; version: number } | null = null
  let proposalId = ''
  try {
    await login(page)
    a = await createProduct(page, KEY_A, NAME_A)
    b = await createProduct(page, KEY_B, NAME_B)
    const created = await page.request.post('/v1/proposals', {
      data: {
        title: `Lifecycle ${stamp}`,
        rows: [
          {
            object_id: a.id,
            object_key: KEY_A,
            type_key: PRODUCT_TYPE,
            base_version: a.version,
            patch: { values: { name: { en: SAVED_A } } },
          },
          {
            object_id: b.id,
            object_key: KEY_B,
            type_key: PRODUCT_TYPE,
            base_version: b.version,
            patch: { values: { name: { en: PROPOSED_B } } },
          },
        ],
      },
    })
    expect(created.ok(), await created.text()).toBeTruthy()
    const proposal = (await created.json()) as { id: string }
    proposalId = proposal.id

    await openProducts(page)
    await filterTo(page, KEY_A)
    const visibleA = rowFor(page, a.id)
    await expect(visibleA).toBeVisible({ timeout: 30_000 })
    await expect(visibleA.getByTestId('cell-diff')).toBeVisible({ timeout: 30_000 })
    await expect(rowFor(page, b.id)).toHaveCount(0)

    await visibleA.click()
    const accepted = page.waitForResponse(
      (response) => response.url().includes(`/v1/proposals/${proposalId}/accept`) && response.ok(),
      { timeout: 30_000 },
    )
    await mainTable(page).getByTestId('review-and-save').click()
    await accepted
    await expect.poll(() => objectName(page, a!.id), { timeout: 30_000 }).toBe(SAVED_A)

    // A background accept must not reach the hidden row after the response.
    await page.waitForTimeout(8_000)
    expect(await objectName(page, b.id)).toBe(NAME_B)
    const after = await proposalBody(page, proposalId)
    expect(after.status, 'a hidden pending row must keep the proposal open').toBe('open')
    expect(after.rows?.find((row) => row.object_id === a!.id)?.status).toBe('accepted')
    expect(after.rows?.find((row) => row.object_id === b!.id)?.status).toBe('pending')

    await page.reload()
    await expect(page.getByTestId('workspace')).toBeVisible()
    await openProducts(page)
    await filterTo(page, KEY_B)
    const visibleB = rowFor(page, b.id)
    await expect(visibleB).toBeVisible({ timeout: 30_000 })
    // The open-proposal projection must still show B's pending change.
    await expect(visibleB.getByTestId('cell-diff')).toBeVisible({ timeout: 30_000 })
    await expect(visibleB.getByTestId('suggestion-count')).toBeVisible()
    const openList = await page.request.get('/v1/proposals?status=open&limit=200')
    expect(openList.ok()).toBeTruthy()
    const listed = (await openList.json()) as { proposals?: Array<{ id?: string; status?: string }> }
    expect(listed.proposals?.some((item) => item.id === proposalId && item.status === 'open')).toBe(true)
    // A proposal with a pending row keeps both bulk actions live and unlabelled.
    await page.locator('nav.tabs').getByRole('button', { name: /Review/ }).click()
    await expect(page.getByTestId(`proposal-row-${proposalId}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`proposal-row-${proposalId}`).click()
    await expect(page.getByTestId('proposal')).toContainText(`Lifecycle ${stamp}`)
    await expectPendingActions(page)
    expect(await objectName(page, b.id)).toBe(NAME_B)
    expect(await objectName(page, a.id)).toBe(SAVED_A)
  } finally {
    if (proposalId) {
      await page.request.post(`/v1/proposals/${proposalId}/discard`).catch(() => undefined)
    }
    if (a) await deleteProduct(page, a.id)
    if (b) await deleteProduct(page, b.id)
  }
})

test('closed accepted, discarded and mixed proposals disable bulk actions and the API refuses to reopen them', async ({ page }) => {
  test.setTimeout(180_000)
  const acceptedTitle = `Closed accepted ${stamp}`
  const discardedTitle = `Closed discarded ${stamp}`
  const mixedTitle = `Closed mixed ${stamp}`
  let a: { id: string; version: number } | null = null
  let b: { id: string; version: number } | null = null
  let c: { id: string; version: number } | null = null
  let d: { id: string; version: number } | null = null
  let acceptedId = ''
  let discardedId = ''
  let mixedId = ''
  try {
    await login(page)
    a = await createProduct(page, KEY_C, NAME_C)
    b = await createProduct(page, KEY_D, NAME_D)
    c = await createProduct(page, KEY_E, NAME_E)
    d = await createProduct(page, KEY_F, NAME_F)

    const accepted = await page.request.post('/v1/proposals', {
      data: {
        title: acceptedTitle,
        rows: [
          {
            object_id: a.id,
            object_key: KEY_C,
            type_key: PRODUCT_TYPE,
            base_version: a.version,
            patch: { values: { name: { en: SAVED_C } } },
          },
        ],
      },
    })
    expect(accepted.ok(), await accepted.text()).toBeTruthy()
    acceptedId = ((await accepted.json()) as { id: string }).id
    const acceptAccepted = await page.request.post(`/v1/proposals/${acceptedId}/accept`, { data: {} })
    expect(acceptAccepted.ok(), await acceptAccepted.text()).toBeTruthy()

    const discarded = await page.request.post('/v1/proposals', {
      data: {
        title: discardedTitle,
        rows: [
          {
            object_id: b.id,
            object_key: KEY_D,
            type_key: PRODUCT_TYPE,
            base_version: b.version,
            patch: { values: { name: { en: PROPOSED_D } } },
          },
        ],
      },
    })
    expect(discarded.ok(), await discarded.text()).toBeTruthy()
    discardedId = ((await discarded.json()) as { id: string }).id
    const discardDiscarded = await page.request.post(`/v1/proposals/${discardedId}/discard`)
    expect(discardDiscarded.ok(), await discardDiscarded.text()).toBeTruthy()

    const mixed = await page.request.post('/v1/proposals', {
      data: {
        title: mixedTitle,
        rows: [
          {
            object_id: c.id,
            object_key: KEY_E,
            type_key: PRODUCT_TYPE,
            base_version: c.version,
            patch: { values: { name: { en: SAVED_E } } },
          },
          {
            object_id: d.id,
            object_key: KEY_F,
            type_key: PRODUCT_TYPE,
            base_version: d.version,
            patch: { values: { name: { en: PROPOSED_F } } },
          },
        ],
      },
    })
    expect(mixed.ok(), await mixed.text()).toBeTruthy()
    const mixedBody = (await mixed.json()) as {
      id: string
      rows: Array<{ id: string; object_id: string }>
    }
    mixedId = mixedBody.id
    const savedRow = mixedBody.rows.find((row) => row.object_id === c!.id)
    expect(savedRow, 'the mixed proposal has a row for C').toBeTruthy()
    const acceptMixed = await page.request.post(`/v1/proposals/${mixedId}/accept`, {
      data: { rows: [savedRow!.id] },
    })
    expect(acceptMixed.ok(), await acceptMixed.text()).toBeTruthy()
    const discardMixed = await page.request.post(`/v1/proposals/${mixedId}/discard`)
    expect(discardMixed.ok(), await discardMixed.text()).toBeTruthy()

    await page.locator('nav.tabs').getByRole('button', { name: /Review/ }).click()
    const review = page.getByTestId('proposal')
    await expect(review).toBeVisible()

    await expect(page.getByTestId(`proposal-row-${acceptedId}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`proposal-row-${acceptedId}`).click()
    await expect(review).toContainText(acceptedTitle)
    await expectClosedActions(page, 'Proposal already accepted', 'closed-accepted-disabled-look.png')
    if (shots) await page.screenshot({ path: `${shots}/closed-accepted-review.png`, fullPage: true })
    await setTheme(page, 'light')
    await expectClosedActions(page, 'Proposal already accepted', 'closed-accepted-disabled-look-light.png')
    await setTheme(page, 'dark')

    const acceptAcceptedAgain = await page.request.post(`/v1/proposals/${acceptedId}/accept`, { data: {} })
    expect(acceptAcceptedAgain.status(), await acceptAcceptedAgain.text()).toBe(409)
    const discardAcceptedAgain = await page.request.post(`/v1/proposals/${acceptedId}/discard`)
    expect(discardAcceptedAgain.status(), await discardAcceptedAgain.text()).toBe(204)
    const acceptedBody = await proposalBody(page, acceptedId)
    expect(acceptedBody.status).toBe('accepted')
    expect(acceptedBody.rows?.find((row) => row.object_id === a!.id)?.status).toBe('accepted')

    await expect(page.getByTestId(`proposal-row-${discardedId}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`proposal-row-${discardedId}`).click()
    await expect(review).toContainText(discardedTitle)
    await expectClosedActions(page, 'Proposal already discarded', 'closed-discarded-disabled-look.png')
    if (shots) await page.screenshot({ path: `${shots}/closed-discarded-review.png`, fullPage: true })

    const acceptDiscardedAgain = await page.request.post(`/v1/proposals/${discardedId}/accept`, { data: {} })
    expect(acceptDiscardedAgain.status(), await acceptDiscardedAgain.text()).toBe(409)
    const discardDiscardedAgain = await page.request.post(`/v1/proposals/${discardedId}/discard`)
    expect(discardDiscardedAgain.status(), await discardDiscardedAgain.text()).toBe(204)
    const discardedBody = await proposalBody(page, discardedId)
    expect(discardedBody.status).toBe('discarded')
    expect(discardedBody.rows?.find((row) => row.object_id === b!.id)?.status).toBe('rejected')

    await expect(page.getByTestId(`proposal-row-${mixedId}`)).toBeVisible({ timeout: 30_000 })
    await page.getByTestId(`proposal-row-${mixedId}`).click()
    await expect(review).toContainText(mixedTitle)
    await expectClosedActions(page, 'Proposal already closed', 'closed-mixed-disabled-look.png')
    if (shots) await page.screenshot({ path: `${shots}/closed-mixed-review.png`, fullPage: true })

    const acceptMixedAgain = await page.request.post(`/v1/proposals/${mixedId}/accept`, { data: {} })
    expect(acceptMixedAgain.status(), await acceptMixedAgain.text()).toBe(409)
    const discardMixedAgain = await page.request.post(`/v1/proposals/${mixedId}/discard`)
    expect(discardMixedAgain.status(), await discardMixedAgain.text()).toBe(204)
    const mixedAfter = await proposalBody(page, mixedId)
    expect(mixedAfter.status).toBe('accepted')
    expect(mixedAfter.rows?.find((row) => row.object_id === c!.id)?.status).toBe('accepted')
    expect(mixedAfter.rows?.find((row) => row.object_id === d!.id)?.status).toBe('rejected')
  } finally {
    for (const id of [acceptedId, discardedId, mixedId]) {
      if (id) await page.request.post(`/v1/proposals/${id}/discard`).catch(() => undefined)
    }
    if (a) await deleteProduct(page, a.id)
    if (b) await deleteProduct(page, b.id)
    if (c) await deleteProduct(page, c.id)
    if (d) await deleteProduct(page, d.id)
  }
})

test('disabled action styles leave other disabled controls muted, not broken', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.evaluate(() => {
    const wrap = document.createElement('div')
    wrap.id = 'row212-disabled-fixture'
    wrap.style.cssText =
      'position:fixed;z-index:2147483647;left:16px;top:16px;display:flex;gap:8px;align-items:center;padding:12px;background:var(--panel);border:1px solid var(--border);border-radius:8px;'
    wrap.innerHTML = [
      '<button class="btn btn-raised" disabled>Neutral</button>',
      '<button class="btn btn-danger" disabled>Danger</button>',
      '<button class="btn btn-accent" disabled>Accent</button>',
      '<button class="btn btn-ghost icon-btn" disabled aria-label="Disabled icon">x</button>',
      '<button class="tab" disabled>Tab</button>',
      '<button class="filter-chip" disabled>Chip</button>',
    ].join('')
    document.body.append(wrap)
  })
  const fixture = page.locator('#row212-disabled-fixture')
  const paint = await fixture.evaluate((node) => {
    const read = (selector: string) => {
      const element = node.querySelector(selector)
      if (!(element instanceof HTMLElement)) throw new Error(`missing ${selector}`)
      const style = getComputedStyle(element)
      return { opacity: Number(style.opacity || 1) }
    }
    return {
      raised: read('.btn-raised'),
      danger: read('.btn-danger'),
      accent: read('.btn-accent'),
      icon: read('.icon-btn'),
      tab: read('.tab'),
      chip: read('.filter-chip'),
    }
  })
  expect(paint.raised.opacity).toBeLessThan(1)
  expect(paint.danger.opacity).toBeLessThan(1)
  expect(paint.accent.opacity).toBeLessThan(1)
  expect(paint.icon.opacity, 'ghost icon buttons keep the global opacity').toBe(1)
  expect(paint.tab.opacity).toBe(1)
  expect(paint.chip.opacity).toBe(1)
  if (shots) await fixture.screenshot({ path: `${shots}/other-disabled-buttons-dark.png` })
  await setTheme(page, 'light')
  if (shots) await fixture.screenshot({ path: `${shots}/other-disabled-buttons-light.png` })
  await setTheme(page, 'dark')
  await page.evaluate(() => document.getElementById('row212-disabled-fixture')?.remove())

  // The real create dialog keeps its local 0.45 disabled rule; the new action
  // styles must not widen or override it.
  await openProducts(page)
  const table = mainTable(page)
  await table.getByTestId('table-add-row').click()
  const dialog = page.getByTestId('new-object')
  await expect(dialog).toBeVisible()
  const submit = dialog.locator('button[type="submit"]').first()
  await submit.evaluate((node) => {
    const button = node as HTMLButtonElement
    button.disabled = true
  })
  const submitOpacity = await submit.evaluate((node) => Number(getComputedStyle(node).opacity || 1))
  expect(submitOpacity).toBeCloseTo(0.45, 2)
  if (shots) await dialog.screenshot({ path: `${shots}/create-dialog-primary-disabled-dark.png` })
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
