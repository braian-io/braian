import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable, waitDetailReady } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function openProductDetail(page: Page, number: string) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  const table = mainTable(page, 'Products')
  await table.getByTestId('quick-filter').first().fill(number)
  const row = table.getByTestId('object-row').filter({ hasText: number }).first()
  await expect(row).toBeVisible()
  await row.click()
  const detail = page.getByTestId('object-detail')
  await expect(detail).toBeVisible()
  await waitDetailReady(page, detail)
  return detail
}

test('row 230 links polish: numeric sort order and edit link attributes entry points', async ({ page }) => {
  test.setTimeout(180_000)
  const stamp = Date.now().toString().slice(-7)
  const productNumber = `R230-P-${stamp}`
  const articleNumber = `R230-A-${stamp}`
  await login(page)

  const article = await page.request.post('/v1/objects', {
    data: {
      type: 'article',
      groups: { food: 'cheese' },
      values: { number: articleNumber, name: { en: articleNumber }, status: 'draft' },
    },
  })
  expect(article.ok(), await article.text()).toBeTruthy()
  const articleBody = (await article.json()) as { id: string }
  const product = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number: productNumber, name: { en: productNumber }, status: 'draft' },
    },
  })
  expect(product.ok(), await product.text()).toBeTruthy()
  const productBody = (await product.json()) as { id: string }

  try {
    const detail = await openProductDetail(page, productNumber)
    await detail.getByTestId('add-link').first().click()
    const picker = page.getByTestId('link-picker')
    await expect(picker).toBeVisible()
    const search = picker.getByTestId('link-search')
    const option = picker.getByRole('option').filter({ hasText: articleNumber }).first()
    await expect(async () => {
      await search.fill(articleNumber)
      await expect(option).toBeVisible()
    }).toPass({ timeout: 15_000 })
    await option.click()

    const create = page.getByTestId('link-create-dialog')
    await expect(create).toBeVisible()
    const sort = create.getByTestId('link-field-sort_order')
    await expect(sort).toHaveAttribute('data-kind', 'number')
    await sort.fill('abc')
    await expect(sort).toHaveValue('')
    await sort.fill('2')
    await expect(sort).toHaveValue('2')
    await create.getByTestId('link-create-confirm').click()
    await expect(create).toBeHidden()

    const linkRow = detail.getByTestId('link-row').filter({ hasText: articleNumber }).first()
    await expect(linkRow).toBeVisible()
    await expect(linkRow.getByTestId('link-inline-sort_order')).toHaveValue('2')

    await linkRow.getByTestId('link-edit-attributes').click()
    const edit = page.getByTestId('link-edit-dialog')
    await expect(edit).toBeVisible()
    const editSort = edit.getByTestId('link-field-sort_order')
    await editSort.fill('5xy')
    await expect(editSort).toHaveValue('5')
    await edit.getByTestId('link-edit-save').click()
    await expect(edit).toBeHidden()
    await expect(linkRow.getByTestId('link-inline-sort_order')).toHaveValue('5')

    await linkRow.click({ button: 'right' })
    await page.getByTestId('context-menu').getByRole('menuitem', { name: 'Edit link attributes' }).click()
    await expect(page.getByTestId('link-edit-dialog')).toBeVisible()
    await page.getByTestId('link-edit-dialog').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('link-edit-dialog')).toBeHidden()
  } finally {
    await page.request.delete(`/v1/objects/${articleBody.id}`).catch(() => undefined)
    await page.request.delete(`/v1/objects/${productBody.id}`).catch(() => undefined)
  }
})