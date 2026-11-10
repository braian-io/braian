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
const KEY_G = `LIFE-G-${stamp}`
const NAME_A = `Lifecycle A ${stamp}`
const NAME_B = `Lifecycle B ${stamp}`
const NAME_C = `Lifecycle C ${stamp}`
const NAME_D = `Lifecycle D ${stamp}`
const NAME_E = `Lifecycle E ${stamp}`
const NAME_F = `Lifecycle F ${stamp}`
const NAME_G = `Lifecycle G ${stamp}`
const SAVED_A = `Lifecycle A saved ${stamp}`
const PROPOSED_B = `Lifecycle B proposed ${stamp}`
const SAVED_C = `Lifecycle C saved ${stamp}`
const SAVED_E = `Lifecycle E saved ${stamp}`
const PROPOSED_D = `Lifecycle D proposed ${stamp}`
const PROPOSED_F = `Lifecycle F proposed ${stamp}`
const PROPOSED_G = `Lifecycle G proposed ${stamp}`

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
        border: style.borderColor,
        color: style.color,
      }
    }
    return { save: read('save-all'), discard: read('discard-all') }
  })
}

type ActionPaint = Awaited<ReturnType<typeof actionPaint>>

const samePaint = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

// A closed proposal changes the buttons from enabled to disabled. The shared
// button transition can still be running when the first computed style is
// read, so wait for two identical reads (and, for the closed actions, for
// Discard all to equal Save all) before asserting anything.
async function settledActionPaint(page: Page, requireEquality = false) {
  let previous: ActionPaint | undefined
  let settled: ActionPaint | undefined
  await expect
    .poll(
      async () => {
        const current = await actionPaint(page)
        const unchanged = previous !== undefined && samePaint(current, previous)
        previous = current
        const equal = !requireEquality || samePaint(current.discard, current.save)
        if (unchanged && equal) settled = current
        return unchanged && equal
      },
      {
        timeout: 10_000,
        message: requireEquality
          ? 'disabled Discard all must settle to exactly the disabled Save all paint'
          : 'proposal action paint must settle before it is compared',
      },
    )
    .toBe(true)
  return settled!
}

async function reasonReadability(page: Page) {
  return page.getByTestId('proposal-actions-reason').evaluate((node) => {
    const parse = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/)
      if (!match) return null
      const parts = match[1]!.split(',').map((part) => Number(part.trim()))
      return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts[3] ?? 1 }
    }
    const luminance = (rgb: { r: number; g: number; b: number }) => {
      const channels = [rgb.r, rgb.g, rgb.b].map((channel) => {
        const value = channel / 255
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
    }
    const style = getComputedStyle(node)
    const foreground = parse(style.color)!
    let background = { r: 0, g: 0, b: 0, a: 0 }
    let current: HTMLElement | null = node instanceof HTMLElement ? node : null
    while (current) {
      const candidate = parse(getComputedStyle(current).backgroundColor)
      if (candidate && candidate.a > 0) {
        background = candidate
        break
      }
      current = current.parentElement
    }
    const ratio =
      (Math.max(luminance(foreground), luminance(background)) + 0.05) /
      (Math.min(luminance(foreground), luminance(background)) + 0.05)
    return { fontSize: Number.parseFloat(style.fontSize), ratio, foreground: style.color, background: getComputedStyle(current ?? node).backgroundColor }
  })
}

type ReasonReadability = Awaited<ReturnType<typeof reasonReadability>>

async function settledReasonReadability(page: Page) {
  let previous: ReasonReadability | undefined
  let settled: ReasonReadability | undefined
  await expect
    .poll(
      async () => {
        const current = await reasonReadability(page)
        const unchanged = previous !== undefined && samePaint(current, previous)
        previous = current
        if (unchanged) settled = current
        return unchanged
      },
      { timeout: 10_000, message: 'the reason text paint must settle before its contrast is read' },
    )
    .toBe(true)
  return settled!
}

async function expectClosedActions(page: Page, reason: string, shot?: string) {
  const review = page.getByTestId('proposal')
  const save = review.getByTestId('save-all')
  const discard = review.getByTestId('discard-all')
  await expect(save).toBeDisabled()
  await expect(discard).toBeDisabled()
  const paint = await settledActionPaint(page, true)
  expect(paint.save.opacity, 'Save all must not look active').toBeLessThan(1)
  expect(paint.discard.opacity, 'Discard all must not look active').toBeLessThan(1)
  expect(ENABLED_DANGER, 'Discard all must not keep the enabled danger fill').not.toContain(paint.discard.background)
  expect(paint.discard, 'disabled Discard all must paint exactly like disabled Save all').toEqual(paint.save)
  const wrapper = review.getByTestId('proposal-actions')
  await expect(wrapper, 'the tooltip must live where hover can reach it').toHaveAttribute('title', reason)
  // A flex item blockifies inline-flex; both keep the buttons and label on one line.
  await expect
    .poll(async () => wrapper.evaluate((node) => getComputedStyle(node).display), {
      timeout: 5_000,
      message: 'the proposal action wrapper must settle on a flex display',
    })
    .toMatch(/^(inline-)?flex$/)
  const explanation = review.getByTestId('proposal-actions-reason')
  await expect(explanation).toHaveText(reason)
  const id = await explanation.getAttribute('id')
  expect(id).toBeTruthy()
  await expect(save).toHaveAttribute('aria-describedby', id!)
  await expect(discard).toHaveAttribute('aria-describedby', id!)
  const readability = await settledReasonReadability(page)
  expect(readability.fontSize, 'reason text is at least the normal 13px').toBeGreaterThanOrEqual(13)
  expect(readability.ratio, `reason contrast ${readability.foreground} on ${readability.background}`).toBeGreaterThanOrEqual(4.5)
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
  const paint = await settledActionPaint(page)
  expect(paint.save.opacity).toBe(1)
  expect(paint.discard.opacity).toBe(1)
  expect(paint.discard.background, 'an enabled Discard all stays danger-coloured').toMatch(/rgb\(251, 113, 133\)|rgb\(192, 35, 62\)/)
  await expect(review.getByTestId('proposal-actions-reason')).toHaveCount(0)
  await expect(review.getByTestId('proposal-actions')).not.toHaveAttribute('title')
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
    await setTheme(page, 'light')
    await expectClosedActions(page, 'Proposal already discarded', 'closed-discarded-disabled-look-light.png')
    await setTheme(page, 'dark')

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

test('selecting a discarded proposal shows loading and never flashes the generic closed reason', async ({ page }) => {
  test.setTimeout(180_000)
  let product: { id: string; version: number } | null = null
  let warmId = ''
  let proposalId = ''
  const warmTitle = `Closed discarded warm ${stamp}`
  const targetTitle = `Closed discarded loading ${stamp}`
  const detailRoute = /\/v1\/proposals\/[^/?]+$/
  try {
    await login(page)
    product = await createProduct(page, KEY_G, NAME_G)
    const makeDiscarded = async (title: string) => {
      const created = await page.request.post('/v1/proposals', {
        data: {
          title,
          rows: [
            {
              object_id: product!.id,
              object_key: KEY_G,
              type_key: PRODUCT_TYPE,
              base_version: product!.version,
              patch: { values: { name: { en: PROPOSED_G } } },
            },
          ],
        },
      })
      expect(created.ok(), await created.text()).toBeTruthy()
      const id = ((await created.json()) as { id: string }).id
      const discarded = await page.request.post(`/v1/proposals/${id}/discard`)
      expect(discarded.ok(), await discarded.text()).toBeTruthy()
      return id
    }
    warmId = await makeDiscarded(warmTitle)
    proposalId = await makeDiscarded(targetTitle)

    await page.locator('nav.tabs').getByRole('button', { name: /Review/ }).click()
    const review = page.getByTestId('proposal')
    await expect(page.getByTestId(`proposal-row-${warmId}`)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId(`proposal-row-${proposalId}`)).toBeVisible({ timeout: 30_000 })
    // Warm the view on a discarded proposal so the observer starts with no
    // generic closed text on screen. Anything closed after this is a flash.
    await page.getByTestId(`proposal-row-${warmId}`).click()
    await expect(review).toContainText(warmTitle)
    await expect(review.getByTestId('proposal-actions-reason')).toHaveText('Proposal already discarded')

    await page.evaluate(() => {
      const state = window as any
      state.__closedSeen = false
      state.__loadingSeen = false
      const check = () => {
        const current = document.querySelector('[data-testid="proposal"]')
        if (!(current instanceof HTMLElement)) return
        if (current.querySelector('[data-testid="proposal-actions-loading"]')) state.__loadingSeen = true
        if (current.innerText.includes('Proposal already closed')) state.__closedSeen = true
      }
      const observer = new MutationObserver(check)
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      state.__closedObserver = observer
      check()
    })
    await page.route(detailRoute, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })

    await page.getByTestId(`proposal-row-${proposalId}`).click()
    const loading = review.getByTestId('proposal-actions-loading')
    await expect(loading).toBeVisible()
    await expect(loading).toHaveText('Loading proposal…')
    await expect(review.getByTestId('save-all')).toBeDisabled()
    await expect(review.getByTestId('discard-all')).toBeDisabled()
    await expect(review.getByTestId('proposal-actions-reason')).toHaveCount(0)
    await expect(review.getByTestId('proposal-actions')).not.toHaveAttribute('title')
    await expect(review.getByText('Proposal already closed')).toHaveCount(0)
    await expect(review.getByTestId('proposal-actions-reason')).toHaveText('Proposal already discarded', { timeout: 30_000 })
    await expect(review.getByTestId('proposal-actions-loading')).toHaveCount(0)
    const observed = await page.evaluate(() => {
      const state = window as any
      state.__closedObserver?.disconnect()
      return { loading: state.__loadingSeen === true, closed: state.__closedSeen === true }
    })
    expect(observed.loading, 'the loading state must be observed').toBe(true)
    expect(observed.closed, 'a discarded proposal must never show the generic closed reason').toBe(false)
    await expect(review.getByText('Proposal already closed')).toHaveCount(0)
  } finally {
    await page.unroute(detailRoute).catch(() => undefined)
    if (proposalId) await page.request.post(`/v1/proposals/${proposalId}/discard`).catch(() => undefined)
    if (warmId) await page.request.post(`/v1/proposals/${warmId}/discard`).catch(() => undefined)
    if (product) await deleteProduct(page, product.id)
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
