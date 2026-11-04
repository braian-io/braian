import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

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

function rowByKey(page: Page, key: string) {
  return mainTable(page).getByTestId('object-row').filter({ hasText: key }).first()
}

async function setNameCell(page: Page, rowId: string, text: string) {
  const row = page.locator(`[id="object-row-${rowId}"]`)
  await row.locator('[data-column="name"]').first().dblclick()
  const editor = page.getByTestId('cell-editor-name')
  await expect(editor).toBeVisible()
  await editor.fill(text)
  await editor.press('Enter')
  await expect(page.getByTestId('cell-editor-name')).toHaveCount(0)
  await expect
    .poll(async () => (await row.locator('[data-column="name"]').first().textContent())?.trim() ?? '', {
      timeout: 30_000,
    })
    .toBe(text)
}

test('Detail Name save never paints an intermediate value', async ({ page }) => {
  test.setTimeout(120_000)
  const original = 'Mature cheddar'
  const edited = 'Mature cheddar flicker'
  await login(page)
  await openProducts(page)

  const row = rowByKey(page, 'PROD-CHEDDAR')
  await expect(row).toBeVisible({ timeout: 60_000 })
  const rowId = (await row.getAttribute('id'))?.replace(/^object-row-/, '') ?? ''
  expect(rowId).not.toBe('')
  const stableRow = page.locator(`[id="object-row-${rowId}"]`)
  const currentName = (await stableRow.locator('[data-column="name"]').first().textContent())?.trim() ?? ''
  if (currentName !== original) await setNameCell(page, rowId, original)

  try {
    await stableRow.click()
    await page.locator('[data-view-type="object_detail"]').first().click()
    const detail = page.getByTestId('object-detail')
    await expect(detail).toBeVisible()
    const title = detail.locator('.detail-title strong')
    await expect(title).toHaveText(original)

    const nameField = detail
      .locator('.field')
      .filter({ has: page.locator('label', { hasText: /^Name$/ }) })
      .first()
    const editor = nameField.locator('.control input').first()
    await expect(editor).toHaveValue(original)
    await editor.fill(edited)
    await expect(title).toHaveText(edited)

    await page.evaluate(({ rowId }) => {
      const titleNode = document.querySelector('.detail-title strong')
      const cellNode = document.querySelector(`[id="object-row-${rowId}"] [data-column="name"]`)
      const seen = { title: [] as string[], cell: [] as string[] }
      ;(window as unknown as { __nameFlicker?: typeof seen }).__nameFlicker = seen
      const watch = (node: Element | null, list: string[]) => {
        if (!node) return
        list.push((node.textContent ?? '').trim())
        new MutationObserver(() => {
          const text = (node.textContent ?? '').trim()
          if (list[list.length - 1] !== text) list.push(text)
        }).observe(node, { childList: true, subtree: true, characterData: true })
      }
      watch(titleNode, seen.title)
      watch(cellNode, seen.cell)
    }, { rowId })

    await detail.getByTestId('review-and-save').click()
    await expect(detail.getByTestId('review-and-save')).toHaveCount(0)
    await expect(title).toHaveText(edited)
    await expect
      .poll(async () => (await stableRow.locator('[data-column="name"]').first().textContent())?.trim() ?? '', {
        timeout: 30_000,
      })
      .toBe(edited)

    const seen = await page.evaluate(
      () => (window as unknown as { __nameFlicker: { title: string[]; cell: string[] } }).__nameFlicker,
    )
    expect(seen.title.filter((value) => value !== edited)).toEqual([])
    const firstEdited = seen.cell.indexOf(edited)
    const lastOriginal = seen.cell.lastIndexOf(original)
    expect(lastOriginal === -1 || firstEdited === -1 || lastOriginal < firstEdited).toBe(true)
  } finally {
    await openProducts(page)
    if (await stableRow.count()) {
      const current = (await stableRow.locator('[data-column="name"]').first().textContent())?.trim() ?? ''
      if (current && current !== original) {
        await setNameCell(page, rowId, original).catch(() => undefined)
      }
    }
  }
})
