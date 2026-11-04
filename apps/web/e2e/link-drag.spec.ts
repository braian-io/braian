import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, paneWithTab, setTheme } from './ui'

// Drag a table row onto another table's row, or onto a Detail link section.
// Several selected rows travel together. A pair with no link type only explains itself.

const shots = process.env.BRAIAN_SHOTS

test.beforeEach(async ({ page }) => {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('object-row').first()).toBeVisible()
})

test('dragging one row onto another table creates the link', async ({ page }) => {
  await openArticles(page)
  await unlink(page, mainTable(page, 'Articles'), 'ART-OAT-1L', 'product_articles')
  const article = row(mainTable(page, 'Articles'), 'ART-OAT-1L')
  const product = row(await allProducts(page), 'PROD-COFFEE')
  await article.dragTo(product)
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Organic oat drink 1 L')
  await shot(page, 'link-drag-dialog-dark.png')
  await page.getByTestId('link-create-confirm').click()
  await expect(dialog).toBeHidden()
  await product.click()
  await expect(page.getByTestId('object-detail')).toContainText('PROD-COFFEE')
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-OAT-1L' })).toBeVisible()
})

test('dragging several selected rows creates one link each', async ({ page }) => {
  await openArticles(page)
  const articles = mainTable(page, 'Articles')
  await unlink(page, articles, 'ART-COFFEE-250', 'product_articles')
  await unlink(page, articles, 'ART-CHOC-100', 'product_articles')
  const coffee = row(articles, 'ART-COFFEE-250')
  const choc = row(articles, 'ART-CHOC-100')
  await coffee.click()
  await choc.click({ modifiers: ['Control'] })
  const product = row(await allProducts(page), 'PROD-OAT')
  await dragOver(page, coffee, product)
  await expect(page.getByTestId('link-drag-ghost')).toHaveText('2 objects')
  await page.mouse.up()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('2 objects')
  await page.getByTestId('link-create-confirm').click()
  await expect(dialog).toBeHidden()
  await product.click()
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-COFFEE-250' })).toBeVisible()
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-CHOC-100' })).toBeVisible()
})

test('dropping on a Detail link section uses that section', async ({ page }) => {
  await openArticles(page)
  const articles = mainTable(page, 'Articles')
  await unlink(page, articles, 'ART-OAT-1L', 'replaces')
  await row(articles, 'ART-CHED-200').click()
  await expect(page.getByTestId('object-detail')).toContainText('ART-CHED-200')
  const section = page.getByTestId('link-section').filter({ hasText: 'Replaced by' })
  await row(articles, 'ART-OAT-1L').dragTo(section)
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('link-type-choice')).toHaveValue('replaces:out')
  await page.getByTestId('link-create-confirm').click()
  await expect(dialog).toBeHidden()
  await expect(section.getByTestId('link-row').filter({ hasText: 'ART-OAT-1L' })).toBeVisible()
})

test('a drop with no allowed link type explains that in a dialog', async ({ page }) => {
  await page.locator('nav.tabs').getByRole('button', { name: /^Suppliers/ }).click()
  const suppliers = mainTable(page, 'Suppliers')
  await row(suppliers, 'SUP-NORTH').click()
  await expect(page.getByTestId('object-detail')).toContainText('SUP-NORTH')
  const section = page.getByTestId('link-section').first()
  await dragOver(page, row(suppliers, 'SUP-COAST'), section)
  await expect(section).toHaveAttribute('data-link-drop', 'true')
  await expect(page.getByTestId('link-drag-ghost')).toBeVisible()
  await shot(page, 'link-drag-over-dark.png')
  await page.mouse.up()
  const invalid = page.getByTestId('link-invalid-dialog')
  await expect(invalid).toBeVisible()
  await expect(invalid).toContainText('This is not a valid link type.')
  await shot(page, 'link-drag-invalid-dark.png')
  await page.keyboard.press('Escape')
  await expect(invalid).toBeHidden()
  await expect(page.getByTestId('link-row').filter({ hasText: 'SUP-COAST' })).toHaveCount(0)
})

test('the light theme shows the drag highlight and both dialogs', async ({ page }) => {
  test.skip(!shots, 'screenshots are taken only when BRAIAN_SHOTS is set')
  await setTheme(page, 'light')
  await openArticles(page)
  const article = row(mainTable(page, 'Articles'), 'ART-CHED-400')
  const product = row(await allProducts(page), 'PROD-CHEDDAR')
  await dragOver(page, article, product)
  await expect(product).toHaveAttribute('data-link-drop', 'true')
  await expect(page.getByTestId('link-drag-ghost')).toHaveText('Mature cheddar 400 g')
  await shot(page, 'link-drag-over-light.png')
  await page.mouse.up()
  await expect(page.getByTestId('link-create-dialog')).toBeVisible()
  await shot(page, 'link-drag-dialog-light.png')
  await page.keyboard.press('Escape')

  await page.locator('nav.tabs').getByRole('button', { name: /^Suppliers/ }).click()
  const suppliers = mainTable(page, 'Suppliers')
  await row(suppliers, 'SUP-NORTH').click()
  await row(suppliers, 'SUP-COAST').dragTo(page.getByTestId('link-section').first())
  await expect(page.getByTestId('link-invalid-dialog')).toBeVisible()
  await shot(page, 'link-drag-invalid-light.png')
  await page.keyboard.press('Escape')
})

async function openArticles(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Articles/ }).click()
  await expect(mainTable(page, 'Articles').getByTestId('object-row').first()).toBeVisible()
}

async function allProducts(page: Page) {
  const pane = paneWithTab(page, 'Products')
  const show = pane.getByTestId('peer-show-all')
  if (await show.isVisible()) await show.click()
  const table = mainTable(page, 'Products')
  await expect(table.getByTestId('object-row').first()).toBeVisible()
  return table
}

function row(table: Locator, key: string) {
  return table.getByTestId('object-row').filter({ hasText: key }).first()
}

async function unlink(page: Page, table: Locator, key: string, linkType: string) {
  const id = ((await row(table, key).getAttribute('id')) ?? '').replace(/^object-row-/, '')
  expect(id).not.toBe('')
  const response = await page.request.get(`/v1/objects/${id}`)
  expect(response.ok()).toBeTruthy()
  const body = (await response.json()) as {
    links?: Array<{ link_type?: string; links?: Array<{ id?: string }> }>
  }
  for (const side of body.links ?? []) {
    if (side.link_type !== linkType) continue
    for (const link of side.links ?? []) {
      if (!link.id) continue
      const deleted = await page.request.delete(`/v1/links/${link.id}`)
      expect(deleted.ok()).toBeTruthy()
    }
  }
}

async function dragOver(page: Page, source: Locator, target: Locator) {
  const start = await visiblePoint(source)
  const end = await visiblePoint(target)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  // Chromium starts the drag on the first move that clears the threshold.
  // That hop stays on the source; the next move is the one that enters the target.
  const hop = await source.evaluate((el, origin) => {
    const candidates = [
      { x: origin.x + 24, y: origin.y },
      { x: origin.x - 24, y: origin.y },
      { x: origin.x, y: origin.y + 8 },
    ]
    for (const point of candidates) {
      const hit = document.elementFromPoint(point.x, point.y)
      if (hit && el.contains(hit)) return point
    }
    return { x: origin.x + 24, y: origin.y }
  }, start)
  await page.mouse.move(hop.x, hop.y)
  await page.mouse.move(end.x, end.y)
}

async function visiblePoint(locator: Locator) {
  const point = await locator.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const right = Math.min(box.right - 2, window.innerWidth - 2)
    const bottom = Math.min(box.bottom - 2, window.innerHeight - 2)
    for (let y = box.top + 4; y <= bottom; y += 6) {
      for (let x = box.left + 8; x <= right; x += 16) {
        const hit = document.elementFromPoint(x, y)
        if (hit && el.contains(hit)) return { x, y }
      }
    }
    return null
  })
  if (!point) throw new Error('missing drag point')
  return point
}

async function shot(page: Page, name: string) {
  if (!shots) return
  mkdirSync(shots, { recursive: true })
  await page.screenshot({ path: join(shots, name) })
}
