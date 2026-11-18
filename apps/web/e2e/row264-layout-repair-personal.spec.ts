import { expect, test, type Browser, type Page } from '@playwright/test'
import { demoCredentials } from './demo'

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('braian.theme', JSON.stringify('dark'))
  })
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible()
}

async function seedDanglingWorkspace(page: Page, name: string) {
  const workspaceId = crypto.randomUUID()
  const structuresId = crypto.randomUUID()
  const ghostLeft = crypto.randomUUID()
  const ghostMid = crypto.randomUUID()
  const ghostRight = crypto.randomUUID()
  const layout = {
    type: 'split',
    dir: 'horizontal',
    ratios: [0.22, 0.78],
    children: [
      { type: 'tabs', views: [structuresId, ghostLeft], active: 0 },
      {
        type: 'split',
        dir: 'horizontal',
        ratios: [0.55, 0.45],
        children: [
          { type: 'tabs', views: [ghostMid], active: 0 },
          { type: 'tabs', views: [ghostRight], active: 0 },
        ],
      },
    ],
  }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name,
      locked: false,
      share_token: `row264-heal-${workspaceId.slice(0, 8)}`,
      layout,
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()
  const structures = await page.request.post('/v1/views', {
    data: {
      id: structuresId,
      workspace_id: workspaceId,
      type: 'data_model',
      title: 'Structures',
      pane: 'main',
      position: 0,
      state: { mode: 'tree' },
    },
  })
  expect(structures.ok(), `create Structures ${structures.status()}`).toBeTruthy()
  return { workspaceId, structuresId, layout }
}

async function sharedLayout(page: Page, workspaceId: string) {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as { layout?: unknown }
  return body.layout
}

async function personalDocument(page: Page, workspaceId: string) {
  const response = await page.request.get(`/v1/workspaces/${workspaceId}/state?environment=default`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as { document?: { focus?: string; layout?: unknown } | null }
  return body.document
}

async function openWorkspaceTab(page: Page, name: string) {
  await page.evaluate(() => sessionStorage.setItem('braian.layout.suppressFlush', '1'))
  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible()
  await page.evaluate(() => sessionStorage.removeItem('braian.layout.suppressFlush'))
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tab = page.locator('nav.tabs').getByRole('button', { name: new RegExp(escaped) })
  await expect(tab).toBeVisible({ timeout: 30_000 })
  await tab.click()
  await expect(page.locator('.pane-tab').filter({ hasText: 'Structures' })).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.pane-tab').filter({ hasText: 'Object types' })).toBeVisible({ timeout: 60_000 })
}

test.describe('row 264 layout repair stays personal', () => {
  test('heal does not rewrite shared workspace layout across two sessions', async ({ browser }) => {
    test.setTimeout(300_000)
    let workspaceId = ''
    const contexts: Array<Awaited<ReturnType<Browser['newContext']>>> = []

  try {
    const seed = await browser.newContext()
    contexts.push(seed)
    const seedPage = await seed.newPage()
    await login(seedPage)
    const name = `Row264 heal ${Date.now()}`
    const seeded = await seedDanglingWorkspace(seedPage, name)
    workspaceId = seeded.workspaceId
    const sharedBefore = await sharedLayout(seedPage, workspaceId)

    const sessionB = await browser.newContext()
    const sessionA = await browser.newContext()
    contexts.push(sessionB, sessionA)
    const pageB = await sessionB.newPage()
    const pageA = await sessionA.newPage()
    await login(pageB)
    await login(pageA)

    const focusB = `row264-focus-b-${Date.now()}`
    const putB = await pageB.request.put(`/v1/workspaces/${workspaceId}/state`, {
      data: {
        environment: 'default',
        document: {
          id: workspaceId,
          title: name,
          focus: focusB,
          layout: {
            type: 'tabs',
            views: [seeded.structuresId],
            active: 0,
          },
        },
      },
    })
    expect(putB.ok(), `seed personal B ${putB.status()}`).toBeTruthy()
    const personalBBefore = await personalDocument(pageB, workspaceId)
    expect(personalBBefore).toMatchObject({ focus: focusB })

    const sharedPosts: Array<{ layout: unknown }> = []
    pageA.on('request', (request) => {
      if (request.method() !== 'POST') return
      if (new URL(request.url()).pathname !== '/v1/workspaces') return
      try {
        const data = request.postDataJSON() as { id?: string; layout?: unknown }
        if (data?.id === workspaceId && data.layout) {
          sharedPosts.push({ layout: data.layout })
        }
      } catch {
        /* non-JSON */
      }
    })

    await openWorkspaceTab(pageA, name)

    await expect
      .poll(async () => JSON.stringify(await sharedLayout(pageA, workspaceId)))
      .toBe(JSON.stringify(sharedBefore))
    expect(
      sharedPosts,
      'automatic heal must not POST a new shared layout to /v1/workspaces',
    ).toEqual([])

    await expect
      .poll(async () => JSON.stringify(await sharedLayout(pageB, workspaceId)))
      .toBe(JSON.stringify(sharedBefore))

    // Session A's heal may update this user's personal document on the server,
    // but it must not touch the shared workspace row other sessions read.
    const personalAfterB = await personalDocument(pageB, workspaceId)
    expect(personalAfterB?.layout).toBeTruthy()
  } finally {
    for (const context of contexts) {
      try {
        await context.close()
      } catch {
        /* already closed */
      }
    }
    if (workspaceId) {
      try {
        const dispose = await browser.newContext()
        const page = await dispose.newPage()
        await login(page)
        await page.request.delete(`/v1/workspaces/${workspaceId}`)
        await dispose.close()
      } catch {
        /* best-effort */
      }
    }
  }
  })
})