import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { objectTokenFor, publicToken, slugify } from '../src/url-public'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
}

function param(page: Page, name: string) {
  return new URL(page.url()).searchParams.get(name)
}

async function detailNumber(page: Page) {
  const node = page.locator('.detail-id')
  if (await node.count() === 0) return ''
  return (await node.first().innerText()).trim()
}

async function createObject(page: Page, type: 'product' | 'article', number: string) {
  const response = await page.request.post('/v1/objects', {
    data: {
      type,
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(response.ok(), `create ${type} ${response.status()} ${await response.text()}`).toBeTruthy()
  return await response.json() as { id: string; version: number; type: string }
}

test('direct object link reloads on the key, and navigation slugs are not uuids', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const key = `Å/&+${Date.now().toString().slice(-6)}`
  const created = await createObject(page, 'product', key)
  const url = `/?${new URLSearchParams({
    ws: 'products',
    view: 'products',
    catalog: 'master_catalog',
    object: key,
  })}`

  await page.goto(url)
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('nav.tabs button.tab.active')).toHaveText(/^Products/)
  await expect(page.locator('.detail-id')).toHaveText(key, { timeout: 30_000 })
  await expect.poll(() => param(page, 'object')).toBe(key)
  await expect.poll(() => param(page, 'ws')).toBe('products')
  await expect.poll(() => param(page, 'view')).not.toMatch(uuidPattern)
  await expect.poll(() => param(page, 'catalog')).toBe('master_catalog')
  expect(param(page, 'object')).not.toBe(created.id)
  expect(page.url()).not.toContain(created.id)
  const names = [...new URL(page.url()).searchParams.keys()]
  expect(names.filter((name) => !['ws', 'view', 'catalog', 'object'].includes(name))).toEqual([])

  await page.reload()
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('.detail-id')).toHaveText(key, { timeout: 30_000 })
  await expect.poll(() => param(page, 'object')).toBe(key)
})

test('renaming the key changes the URL and the old link does not open it', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const key = `OLD-${Date.now().toString().slice(-6)}`
  const next = `NEW-${Date.now().toString().slice(-6)}`
  const created = await createObject(page, 'product', key)
  const oldUrl = `/?${new URLSearchParams({
    ws: 'products',
    view: 'products',
    catalog: 'master_catalog',
    object: key,
  })}`
  await page.goto(oldUrl)
  await expect(page.locator('.detail-id')).toHaveText(key, { timeout: 30_000 })

  const patched = await page.request.patch(`/v1/objects/${created.id}`, {
    headers: { 'If-Match': String(created.version) },
    data: { values: { number: next } },
  })
  expect(patched.ok(), `patch ${patched.status()} ${await patched.text()}`).toBeTruthy()
  await expect.poll(() => param(page, 'object'), { timeout: 20_000 }).toBe(next)
  await expect(page.locator('.detail-id')).toHaveText(next)

  await page.goto(oldUrl)
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => param(page, 'object'), { timeout: 20_000 }).not.toBe(key)
  await expect.poll(() => detailNumber(page), { timeout: 15_000 }).toBe('')
})

test('duplicate names and keys stay unambiguous, including a short id', async ({ page }) => {
  test.setTimeout(180_000)
  await login(page)
  const name = `Url Twin ${Date.now().toString().slice(-5)}`
  const [first, second] = [crypto.randomUUID(), crypto.randomUUID()].sort()
  for (const id of [second, first]) {
    const response = await page.request.post('/v1/workspaces', {
      data: {
        id,
        name,
        locked: false,
        share_token: `url-twin-${id.slice(0, 8)}`,
        layout: { type: 'tabs', views: [], active: 0 },
      },
    })
    expect(response.ok(), `workspace ${response.status()}`).toBeTruthy()
  }
  const rows = [
    { id: first, label: name },
    { id: second, label: name },
  ]
  const bare = publicToken(rows, first)
  const suffixed = publicToken(rows, second)
  expect(bare).toBe(slugify(name))
  expect(suffixed).toContain('~')

  const me = await page.request.get('/v1/me')
  const userId = ((await me.json()) as { user_id?: string }).user_id
  expect(userId).toBeTruthy()
  const active = async () => page.evaluate((key) => localStorage.getItem(key), `braian.activeWorkspace.${userId}`)

  await page.goto(`/?ws=${encodeURIComponent(suffixed!)}&catalog=master_catalog`)
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect.poll(active, { timeout: 20_000 }).toBe(JSON.stringify(second))
  await expect.poll(() => param(page, 'ws')).toBe(suffixed)

  await page.goto(`/?ws=${encodeURIComponent(bare!)}&catalog=master_catalog`)
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect.poll(active, { timeout: 20_000 }).toBe(JSON.stringify(first))

  const key = `DUP-${Date.now().toString().slice(-6)}`
  const product = await createObject(page, 'product', key)
  const article = await createObject(page, 'article', key)
  const peers = [
    { id: product.id, key },
    { id: article.id, key },
  ]
  const productWs = await singleViewWorkspace(page, 'Url Products', 'object_table', 'Products', {
    type_key: 'product',
    object_type: '018f0000-0000-7000-8000-000000000200',
  })
  const articleWs = await singleViewWorkspace(page, 'Url Articles', 'object_table', 'Articles', {
    type_key: 'article',
    object_type: '018f0000-0000-7000-8000-000000000201',
  })
  const detailWs = await singleViewWorkspace(page, 'Url Detail', 'object_detail', 'Detail', {})

  await page.goto(`/?${new URLSearchParams({
    ws: productWs.ws,
    view: productWs.view,
    catalog: 'master_catalog',
    object: key,
  })}`)
  await expect(page.locator('.detail-id')).toHaveText(key, { timeout: 30_000 })
  await expect(page.locator('.field-chips').getByText('Product', { exact: true })).toBeVisible()
  await expect.poll(() => param(page, 'object')).toBe(key)

  await page.goto(`/?${new URLSearchParams({
    ws: articleWs.ws,
    view: articleWs.view,
    catalog: 'master_catalog',
    object: key,
  })}`)
  await expect(page.locator('.detail-id')).toHaveText(key, { timeout: 30_000 })
  await expect(page.locator('.field-chips').getByText('Article', { exact: true })).toBeVisible()

  const loser = peers.slice().sort((a, b) => a.id < b.id ? -1 : 1)[1]
  const token = objectTokenFor(loser, peers)
  expect(token).toContain('~')
  const detailUrl = `/?${new URLSearchParams({
    ws: detailWs.ws,
    view: detailWs.view,
    catalog: 'master_catalog',
    object: token!,
  })}`
  await page.goto(detailUrl)
  await expect(page.locator('.detail-id')).toHaveText(key, { timeout: 30_000 })
  await expect.poll(() => param(page, 'object')).toBe(token)
  const loserType = loser.id === product.id ? 'Product' : 'Article'
  await expect(page.locator('.field-chips').getByText(loserType, { exact: true })).toBeVisible()
})

test('back and forward restore the object, and bad targets do not open a row', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const rows = page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Products' }),
  }).getByTestId('object-row')
  await expect(rows.nth(1)).toBeVisible({ timeout: 60_000 })
  await rows.nth(0).click()
  await expect(rows.nth(0)).toHaveAttribute('aria-selected', 'true')
  const first = await rows.nth(0).locator('[data-column="key"]').innerText()
  await expect.poll(() => param(page, 'object')).toBe(first.trim())
  const firstUrl = page.url()
  await rows.nth(1).click()
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true')
  const second = (await rows.nth(1).locator('[data-column="key"]').innerText()).trim()
  await expect.poll(() => param(page, 'object')).toBe(second)
  expect(second).not.toBe(first.trim())

  await page.goBack()
  await expect.poll(() => param(page, 'object')).toBe(first.trim())
  await expect(page.locator('.detail-id')).toHaveText(first.trim())
  await page.goForward()
  await expect.poll(() => param(page, 'object')).toBe(second)
  await expect(page.locator('.detail-id')).toHaveText(second)

  const id = ((await rows.nth(1).getAttribute('id')) ?? '').replace('object-row-', '')
  await page.goto(`/?${new URLSearchParams({
    ws: 'not-a-workspace',
    view: 'missing-view',
    catalog: 'missing-catalog',
    object: id,
  })}`)
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => param(page, 'object')).not.toBe(id)
  await expect.poll(() => param(page, 'ws')).not.toBe('not-a-workspace')
  await expect.poll(() => detailNumber(page)).not.toBe(second)

  await page.goto(firstUrl)
  await expect(page.locator('.detail-id')).toHaveText(first.trim(), { timeout: 30_000 })
  await page.goto(`/?${new URLSearchParams({
    ws: 'products',
    view: 'products',
    catalog: 'master_catalog',
    object: 'no-such-key-zz',
  })}`)
  await expect(page.getByTestId('dock')).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => detailNumber(page), { timeout: 15_000 }).toBe('')
  await expect.poll(() => param(page, 'object')).not.toBe('no-such-key-zz')
})

async function singleViewWorkspace(
  page: Page,
  name: string,
  type: string,
  title: string,
  state: Record<string, unknown>,
) {
  const workspaceId = crypto.randomUUID()
  const viewId = crypto.randomUUID()
  const detailId = crypto.randomUUID()
  const suffix = workspaceId.slice(0, 8)
  const label = `${name} ${suffix}`
  const withDetail = type === 'object_table'
  const layout = withDetail
    ? {
        type: 'split',
        dir: 'horizontal',
        ratios: [0.62, 0.38],
        children: [
          { type: 'tabs', views: [viewId], active: 0 },
          { type: 'tabs', views: [detailId], active: 0 },
        ],
      }
    : { type: 'tabs', views: [viewId], active: 0 }
  const created = await page.request.post('/v1/workspaces', {
    data: {
      id: workspaceId,
      name: label,
      locked: false,
      share_token: `url-${suffix}`,
      layout,
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const views = [
    {
      id: viewId,
      workspace_id: workspaceId,
      type,
      title,
      pane: 'main',
      position: 0,
      state,
    },
    ...(withDetail
      ? [{
          id: detailId,
          workspace_id: workspaceId,
          type: 'object_detail',
          title: 'Detail',
          pane: 'right',
          position: 0,
          state: {},
        }]
      : []),
  ]
  for (const view of views) {
    const response = await page.request.post('/v1/views', { data: view })
    expect(response.ok(), `${view.title} ${response.status()} ${await response.text()}`).toBeTruthy()
  }
  return { ws: slugify(label), view: slugify(title) }
}
