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

async function seedUnlockedWorkspace(page: Page, name: string) {
  const workspaceId = crypto.randomUUID()
  const historyId = crypto.randomUUID()
  const agentId = crypto.randomUUID()
  // Agent shares the main tab group, so opening the workspace runs agent-dock
  // heal. No share_token and unlocked: that is the debounce path that used to
  // POST the healed layout onto the shared workspace row.
  const layout = {
    type: 'tabs',
    views: [historyId, agentId],
    active: 0,
  }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name,
      locked: false,
      layout,
    },
  })
  expect(created.ok(), `create workspace ${created.status()}`).toBeTruthy()
  const createdBody = (await created.json()) as { id?: string }
  expect(createdBody.id).toBe(workspaceId)
  const history = await page.request.post('/v1/views', {
    data: {
      id: historyId,
      workspace_id: workspaceId,
      type: 'history',
      title: 'History',
      pane: 'main',
      position: 0,
      state: {},
    },
  })
  expect(history.ok(), `create History ${history.status()}`).toBeTruthy()
  const agent = await page.request.post('/v1/views', {
    data: {
      id: agentId,
      workspace_id: workspaceId,
      type: 'agent',
      title: 'Ask',
      pane: 'main',
      position: 1,
      state: {},
    },
  })
  expect(agent.ok(), `create agent ${agent.status()}`).toBeTruthy()
  const readback = await page.request.get(`/v1/workspaces/${workspaceId}`)
  expect(readback.ok()).toBeTruthy()
  const stored = (await readback.json()) as { share_token?: string | null; locked?: boolean }
  expect(stored.share_token ?? null).toBeNull()
  expect(stored.locked).toBe(false)
  return { workspaceId, historyId, layout }
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
  await expect(page.locator('.pane-tab').filter({ hasText: 'History' })).toBeVisible({ timeout: 60_000 })
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
    const seeded = await seedUnlockedWorkspace(seedPage, name)
    workspaceId = seeded.workspaceId
    const sharedBefore = await sharedLayout(seedPage, workspaceId)

    const sessionB = await browser.newContext()
    const sessionA = await browser.newContext()
    contexts.push(sessionB, sessionA)
    const pageB = await sessionB.newPage()
    const pageA = await sessionA.newPage()
    await pageA.goto('/')
    expect(await pageA.evaluate(() => localStorage.length), 'new device starts with empty localStorage').toBe(0)
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
            views: [seeded.historyId],
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

    // The debounced shared POST fires 700ms after paint. Read again after that
    // window so a late write cannot pass the poll above.
    await pageA.waitForTimeout(1_500)
    expect(
      sharedPosts,
      'automatic heal must not POST a new shared layout to /v1/workspaces',
    ).toEqual([])
    expect(JSON.stringify(await sharedLayout(pageA, workspaceId))).toBe(JSON.stringify(sharedBefore))
    const personalAfterB = await personalDocument(pageB, workspaceId)
    expect(personalAfterB?.focus, 'other session personal layout').toBe(focusB)
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