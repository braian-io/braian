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
  await dragOver(page, article, product)
  await expect(product).toHaveAttribute('data-link-drop', 'true')
  await expect(page.getByTestId('link-drag-ghost')).toContainText('Link ')
  await shot(page, 'link-drag-over-dark.png')
  await page.mouse.up()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('link-ends')).toContainText('PROD-COFFEE')
  await expect(dialog.getByTestId('link-ends')).toContainText('ART-OAT-1L')
  await expect(dialog.getByTestId('link-ends')).toContainText('←')
  await expect(dialog.getByTestId('link-type-single')).toBeVisible()
  await shot(page, 'link-drag-dialog-dark.png')
  await page.getByTestId('link-create-confirm').click()
  await expect(dialog).toBeHidden()
  const notice = page.locator('[data-sonner-toast]').filter({ hasText: 'Linked 1 article' })
  await expect(notice).toBeVisible()
  await expect.poll(async () => {
    const box = await notice.boundingBox()
    if (!box) return 0
    return box.y >= 0 && box.y + box.height <= 890 ? 1 : box.y
  }).toBe(1)
  await shot(page, 'link-drag-toast-dark.png')
  await product.click()
  await expect(page.getByTestId('object-detail')).toContainText('PROD-COFFEE')
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-OAT-1L' })).toBeVisible()
  await notice.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByTestId('link-row').filter({ hasText: 'ART-OAT-1L' })).toHaveCount(0)
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
  await expect(page.getByTestId('link-drag-ghost')).toHaveText('Link 2 articles')
  await page.mouse.up()
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('link-ends')).toContainText('ART-COFFEE-250')
  await expect(dialog.getByTestId('link-ends')).toContainText('ART-CHOC-100')
  await expect(dialog.getByTestId('link-ends')).toContainText('PROD-OAT')
  await shot(page, 'link-drag-dialog-multi-dark.png')
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

test('a drop with no allowed link type refuses during the drag', async ({ page }) => {
  await page.locator('nav.tabs').getByRole('button', { name: /^Suppliers/ }).click()
  const suppliers = mainTable(page, 'Suppliers')
  await row(suppliers, 'SUP-NORTH').click()
  await expect(page.getByTestId('object-detail')).toContainText('SUP-NORTH')
  const section = page.getByTestId('link-section').first()
  await dragOver(page, row(suppliers, 'SUP-COAST'), section)
  await expect(section).not.toHaveAttribute('data-link-drop', 'true')
  await expect(page.getByTestId('link-drag-ghost')).toHaveText("Suppliers can't link to Suppliers")
  await shot(page, 'link-drag-over-invalid-dark.png')
  await page.mouse.up()
  await expect(page.getByTestId('link-drag-ghost')).toHaveCount(0)
  await expect(page.getByTestId('link-row').filter({ hasText: 'SUP-COAST' })).toHaveCount(0)
})

test('a partial multi-drop names the failure and does not create the saved link again', async ({ page }) => {
  await openArticles(page)
  const articles = mainTable(page, 'Articles')
  await unlink(page, articles, 'ART-COFFEE-250', 'product_articles')
  await unlink(page, articles, 'ART-CHOC-100', 'product_articles')
  const posted: string[] = []
  await page.route('**/v1/links', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const body = route.request().postDataJSON() as { to_id?: string }
    posted.push(String(body.to_id ?? ''))
    if (posted.length === 2) {
      await route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({ detail: 'link type product_articles allows one link to each target' }),
      })
      return
    }
    await route.continue()
  })
  const coffee = row(articles, 'ART-COFFEE-250')
  const choc = row(articles, 'ART-CHOC-100')
  await coffee.click()
  await choc.click({ modifiers: ['Control'] })
  const product = row(await allProducts(page), 'PROD-OAT')
  await coffee.dragTo(product)
  const dialog = page.getByTestId('link-create-dialog')
  await expect(dialog).toBeVisible()
  await page.getByTestId('link-create-confirm').click()
  await expect(dialog.getByTestId('link-create-error')).toContainText('Linked 1 of 2')
  await expect(dialog.getByTestId('link-create-error')).toContainText('allows one link')
  const firstSaved = posted[0] ?? ''
  const failed = posted[1] ?? ''
  expect(firstSaved).not.toBe('')
  expect(failed).not.toBe(firstSaved)
  await page.getByTestId('link-create-confirm').click()
  await expect.poll(() => posted.length).toBe(3)
  expect(posted.filter((id) => id === firstSaved)).toHaveLength(1)
  expect(posted[2]).toBe(failed)
  await expect(dialog).toBeHidden()
})

test('Escape during a drag clears the preview and the drop highlight', async ({ page }) => {
  await openArticles(page)
  const article = row(mainTable(page, 'Articles'), 'ART-OAT-1L')
  const product = row(await allProducts(page), 'PROD-COFFEE')
  await dragOver(page, article, product)
  await expect(page.getByTestId('link-drag-ghost')).toBeVisible()
  await expect(product).toHaveAttribute('data-link-drop', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('link-drag-ghost')).toHaveCount(0)
  await expect(product).not.toHaveAttribute('data-link-drop', 'true')
  await expect(page.getByTestId('link-create-dialog')).toHaveCount(0)
})

test('shift-click still selects and double-click still edits', async ({ page }) => {
  await openArticles(page)
  const articles = mainTable(page, 'Articles')
  const first = row(articles, 'ART-OAT-1L')
  const second = row(articles, 'ART-CHED-200')
  await first.click()
  await second.click({ modifiers: ['Shift'] })
  await expect(second).toHaveClass(/selected/)
  await expect(first).toHaveClass(/picked/)
  await second.locator('[data-column="name"]').dblclick()
  await expect(page.getByTestId('cell-editor-name')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
})

test('the row menu can link the selection', async ({ page }) => {
  await openArticles(page)
  const articles = mainTable(page, 'Articles')
  const coffee = row(articles, 'ART-COFFEE-250')
  const choc = row(articles, 'ART-CHOC-100')
  await coffee.click()
  await choc.click({ modifiers: ['Control'] })
  await coffee.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Link selected to…' }).click()
  await expect(page.getByTestId('link-picker')).toBeVisible()
  await page.getByTestId('link-search').press('Escape')
  await expect(page.getByTestId('link-picker')).toHaveCount(0)
})

test('the light theme shows the drag highlight, dialogs, and toast', async ({ page }) => {
  test.skip(!shots, 'screenshots are taken only when BRAIAN_SHOTS is set')
  await setTheme(page, 'light')
  await openArticles(page)
  await unlink(page, mainTable(page, 'Articles'), 'ART-CHED-400', 'product_articles')
  const article = row(mainTable(page, 'Articles'), 'ART-CHED-400')
  const product = row(await allProducts(page), 'PROD-CHEDDAR')
  await dragOver(page, article, product)
  await expect(product).toHaveAttribute('data-link-drop', 'true')
  await expect(page.getByTestId('link-drag-ghost')).toContainText('Link ')
  await shot(page, 'link-drag-over-light.png')
  await page.mouse.up()
  await expect(page.getByTestId('link-ends')).toContainText('PROD-CHEDDAR')
  await expect(page.getByTestId('link-ends')).toContainText('ART-CHED-400')
  await shot(page, 'link-drag-dialog-light.png')
  await page.getByTestId('link-create-confirm').click()
  const lightToast = page.locator('[data-sonner-toast]').filter({ hasText: 'Linked 1 article' })
  await expect(lightToast).toBeVisible()
  await expect.poll(async () => {
    const box = await lightToast.boundingBox()
    if (!box) return 0
    return box.y >= 0 && box.y + box.height <= 890 ? 1 : box.y
  }).toBe(1)
  await shot(page, 'link-drag-toast-light.png')
  await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click()

  const articles = mainTable(page, 'Articles')
  await unlink(page, articles, 'ART-COFFEE-250', 'product_articles')
  await unlink(page, articles, 'ART-CHOC-100', 'product_articles')
  const coffee = row(articles, 'ART-COFFEE-250')
  const choc = row(articles, 'ART-CHOC-100')
  await coffee.click()
  await choc.click({ modifiers: ['Control'] })
  const oat = row(await allProducts(page), 'PROD-OAT')
  await coffee.dragTo(oat)
  await expect(page.getByTestId('link-ends')).toContainText('ART-COFFEE-250')
  await shot(page, 'link-drag-dialog-multi-light.png')
  await page.keyboard.press('Escape')

  await page.locator('nav.tabs').getByRole('button', { name: /^Suppliers/ }).click()
  const suppliers = mainTable(page, 'Suppliers')
  await row(suppliers, 'SUP-NORTH').click()
  const section = page.getByTestId('link-section').first()
  await dragOver(page, row(suppliers, 'SUP-COAST'), section)
  await expect(page.getByTestId('link-drag-ghost')).toHaveText("Suppliers can't link to Suppliers")
  await shot(page, 'link-drag-over-invalid-light.png')
  await page.mouse.up()
  await page.keyboard.press('Escape')
})

async function openArticles(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Articles/ }).click()
  const table = mainTable(page, 'Articles')
  const search = table.getByPlaceholder('Search')
  if (await search.inputValue()) await search.fill('')
  await expect(table.getByTestId('object-row').first()).toBeVisible()
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
