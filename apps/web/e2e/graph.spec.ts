import { mainTable, setTheme } from './ui'
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { demoCredentials } from './demo'

const shots = '/opt/cursor/artifacts/graph'

async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('braian.theme', JSON.stringify('dark'))
  })
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function openArticles(page: Page) {
  const tab = page.locator('nav.tabs').getByRole('button', { name: /^Articles/ })
  await tab.click()
  await expect(tab).toHaveClass(/active/)
  await expect(page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Articles' })).toBeVisible({
    timeout: 30_000,
  })
}

function articlesPane(page: Page) {
  return page.locator('section.pane').filter({
    has: page.locator('.pane-tab[data-view-type="object_table"]', { hasText: 'Articles' }),
  })
}

async function openCheddar(page: Page) {
  await openArticles(page)
  const articles = articlesPane(page)
  await articles.getByTestId('quick-filter').fill('ART-CHED-200')
  const row = articles.getByTestId('object-row').filter({ hasText: 'ART-CHED-200' }).first()
  await expect(row).toBeVisible()
  const objectId = (await row.getAttribute('id'))?.replace(/^object-row-/, '') ?? ''
  expect(objectId, 'article row id').not.toBe('')
  const stored = await page.request.get(`/v1/objects/${objectId}`)
  expect(stored.ok()).toBeTruthy()
  const body = (await stored.json()) as { values?: { storage?: string; name?: { en?: string } } }
  expect(body.values?.storage, JSON.stringify(body.values)).toBe('chilled')
  expect(body.values?.name?.en).toBe('Mature cheddar 200 g')
  await row.click()
  await page.locator('.pane-tab', { hasText: 'Graph' }).first().click()
  await expect(page.locator('canvas[data-testid=graph]')).toBeVisible()
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true')
  await expect(page.getByTestId('graph-inspector')).toContainText('Mature cheddar 200 g')
  return objectId
}

test('force-directed graph', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)
  const objectId = await openCheddar(page)

  for (const kind of ['type-article', 'group', 'value', 'structure']) {
    await expect(page.getByTestId(`legend-${kind}`)).toBeVisible()
    await expect(page.getByTestId(`legend-${kind}`)).toHaveAttribute('aria-pressed', 'true')
  }
  await expect(page.getByTestId('legend-class')).toHaveCount(0)
  const provenance = page.getByTestId('attribute-provenance')
  await expect(provenance).toContainText('Number')
  await expect(provenance).toContainText('Storage')
  await expect(provenance).not.toContainText('Colour')
  await expect(provenance).not.toContainText('Nummer')
  await expect(provenance).not.toContainText('namn')
  await expect(provenance).not.toContainText('friluft')

  await page.getByRole('button', { name: 'Open full size' }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  await expect.poll(async () => (await page.locator('canvas[data-testid=graph]').boundingBox())?.width ?? 0).toBeGreaterThan(800)

  if (process.env.BRAIAN_GRAPH_SHOTS) {
    mkdirSync(shots, { recursive: true })
    await page.screenshot({ path: `${shots}/dark.png` })
  }

  const nodes = page.getByTestId('graph-nodes')
  const storage = nodes.locator(`[data-node-id="value:${objectId}:storage"]`)
  await expect(storage).toHaveAttribute('data-x', /-?\d+/)
  await storage.dispatchEvent('click')
  await expect(page.getByTestId('graph-inspector')).toContainText('Storage')
  await expect(page.getByTestId('graph-inspector')).toContainText('Chilled')
  if (process.env.BRAIAN_GRAPH_SHOTS) await page.screenshot({ path: `${shots}/selected.png` })

  const x = Number(await storage.getAttribute('data-x'))
  const y = Number(await storage.getAttribute('data-y'))
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 70, y + 28, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByTestId('graph-unpin')).toBeVisible()
  await page.getByTestId('graph-unpin').click()
  await expect(page.getByTestId('graph-unpin')).toHaveCount(0)

  await page.getByTestId('legend-value').click()
  await expect(page.getByTestId('legend-value')).toHaveAttribute('aria-pressed', 'false')
  await expect(nodes.getByRole('button', { name: 'Storage', exact: true })).toHaveCount(0)
  await page.getByTestId('legend-value').click()
  await expect(page.getByTestId('graph-inspector')).toContainText('Storage')

  const before = await nodes.locator('button').count()
  const product = nodes.getByRole('button', { name: 'Mature cheddar', exact: true })
  await expect(product).toHaveCount(1)
  await product.dispatchEvent('dblclick')
  await expect.poll(async () => nodes.locator('button').count()).toBeGreaterThan(before)
  await expect(nodes.getByRole('button', { name: 'Ingredients', exact: true })).toHaveCount(1)
  await expect(nodes.getByRole('button', { name: 'Nutri-Score', exact: true })).toHaveCount(1)
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true', { timeout: 15_000 })
  if (process.env.BRAIAN_GRAPH_SHOTS) await page.screenshot({ path: `${shots}/expanded.png` })

  const recipe = nodes.getByRole('button', { name: 'Mature cheddar', exact: true })
  await recipe.dispatchEvent('click')
  await expect(page.getByTestId('graph-inspector')).toContainText('Mature cheddar')
  await expect(page.getByTestId('graph-inspector')).toContainText('PROD-CHEDDAR')
  if (process.env.BRAIAN_GRAPH_SHOTS) await page.screenshot({ path: `${shots}/selected.png` })

  await page.getByTestId('graph-fit').click()
  await page.getByTestId('graph-relayout').click()
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'false')
  await expect(page.locator('canvas[data-testid=graph]')).toHaveAttribute('data-settled', 'true')

  await page.getByRole('button', { name: 'Close full size' }).click()
  await setTheme(page, 'light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Open full size' }).click()
  await expect(page.getByTestId('graph-full')).toBeVisible()
  if (process.env.BRAIAN_GRAPH_SHOTS) await page.screenshot({ path: `${shots}/light.png` })
  await page.getByRole('button', { name: 'Close full size' }).click()
  await setTheme(page, 'dark')
  const filters = page.getByTestId('quick-filter')
  for (let index = 0; index < (await filters.count()); index += 1) await filters.nth(index).fill('')
  await page.locator('[data-view-type="object_detail"]').first().click()
})

type ModelDef = {
  id?: string
  key?: string
  kind?: string
  labels?: Record<string, string>
  singular?: Record<string, string>
  attributes?: unknown[]
  link?: {
    from_types?: unknown[]
    to_types?: unknown[]
    from_cardinality?: string
    to_cardinality?: string
  }
}

type ModelDefs = { types?: ModelDef[]; attributes?: ModelDef[] }

function modelLabel(item: ModelDef | undefined) {
  return item?.labels?.en || item?.singular?.en || String(item?.key ?? '')
}

function cardinalityMark(value: string | undefined) {
  return value === 'one' ? '1' : 'n'
}

test('data model graph tab shows types, counts and link labels', async ({ page }) => {
  test.setTimeout(120_000)
  await login(page)

  const definitions = (await (await page.request.get('/v1/definitions')).json()) as ModelDefs
  const types = definitions.types ?? []
  const attributes = definitions.attributes ?? []
  const byToken = new Map<string, ModelDef>()
  for (const type of types) {
    if (type.id) byToken.set(String(type.id), type)
    if (type.key) byToken.set(String(type.key), type)
  }
  const objectTypes = types.filter((type) => type.kind !== 'link' && type.key)
  const chosen = objectTypes.find((type) => (type.attributes?.length ?? 0) > 0) ?? objectTypes[0]
  expect(chosen, 'object type in definitions').toBeTruthy()

  const attrKey = new Map(attributes.map((attribute) => [String(attribute.id ?? ''), String(attribute.key ?? '')]))
  const expectedAttributes = (chosen?.attributes ?? [])
    .map((token) => attrKey.get(String(token)) ?? String(token))
    .filter(Boolean)
  expect(expectedAttributes.length, 'chosen type attributes').toBeGreaterThan(0)

  const link = types.find((type) => {
    const spec = type.link
    if (type.kind !== 'link' || !spec) return false
    const from = (spec.from_types ?? []).map((token) => byToken.get(String(token))).find(Boolean)
    const to = (spec.to_types ?? []).map((token) => byToken.get(String(token))).find(Boolean)
    return Boolean(from && to && from.kind !== 'link' && to.kind !== 'link')
  })
  expect(link, 'link type in definitions').toBeTruthy()
  const expectedEdge = `${modelLabel(link)} ${cardinalityMark(link?.link?.from_cardinality)}–${cardinalityMark(link?.link?.to_cardinality)}`

  await page.locator('nav.tabs').getByRole('button', { name: /^Data model/ }).click()
  const graphTab = page.locator('.pane-tab', { hasText: 'Data model graph' }).first()
  await expect(graphTab).toBeVisible({ timeout: 60_000 })
  await graphTab.click()
  const canvas = page.locator('canvas[data-testid=graph]')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-settled', 'true', { timeout: 30_000 })

  const nodes = page.getByTestId('graph-nodes')
  await expect(nodes.locator('[data-node-id^="type:"]')).not.toHaveCount(0)
  const chosenNode = nodes.locator(`[data-node-id="type:${chosen?.key ?? ''}"]`)
  await expect(chosenNode).toHaveAttribute('data-subtitle', /^\d+$/)
  await expect(page.getByTestId('graph-edges')).toContainText(expectedEdge)

  await chosenNode.dispatchEvent('click')
  const attributeTab = page.locator('.pane-tab', { hasText: 'Type attributes' }).first()
  await attributeTab.click()
  const table = page.getByTestId('attribute-table')
  await expect(table).toBeVisible()
  await expect(table.locator(`[data-attr="${expectedAttributes[0]}"]`).first()).toBeVisible()
})
