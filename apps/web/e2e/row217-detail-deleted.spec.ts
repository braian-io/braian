import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

type Created = { id: string; version: number }

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByTestId('workspace')).toBeVisible()
}

async function createProduct(page: Page, number: string): Promise<Created> {
  const response = await page.request.post('/v1/objects', {
    data: {
      type: 'product',
      groups: { food: 'bread' },
      values: { number, name: { en: number }, status: 'draft' },
    },
  })
  expect(response.ok(), await response.text()).toBeTruthy()
  return await response.json() as Created
}

async function openProducts(page: Page) {
  await page.locator('nav.tabs').getByRole('button', { name: /^Products/ }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function filterTo(page: Page, text: string) {
  const filter = mainTable(page).getByTestId('quick-filter').first()
  await filter.fill(text)
  await expect(filter).toHaveValue(text)
}

function rowFor(page: Page, id: string) {
  return page.locator(`#object-row-${id}`)
}

async function openDetailTab(page: Page) {
  await page.locator('.pane-tab[data-view-type="object_detail"]').first().click()
}

async function expectNoGraphOrValidationCopy(page: Page) {
  await expect(page.getByText('The graph could not be loaded.')).toHaveCount(0)
  await expect(page.getByText('Validation stopped the save.')).toHaveCount(0)
}

test.describe('row 217 detail when object deleted', () => {
  test('K1/K2/K4: deleted object shows empty Detail and another row opens normally', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const stamp = Date.now().toString().slice(-7)
    const prefix = `R217-${stamp}`
    const firstNumber = `${prefix}-A`
    const secondNumber = `${prefix}-B`
    await login(page)
    const first = await createProduct(page, firstNumber)
    const second = await createProduct(page, secondNumber)
  const objectReads: number[] = []
    page.on('request', (request) => {
      const url = request.url()
      if (request.method() === 'GET' && url.includes(`/v1/objects/${first.id}`) && !url.includes('graph')) {
        objectReads.push(1)
      }
    })
    try {
      await openProducts(page)
      await filterTo(page, prefix)
      await rowFor(page, first.id).click()
      await openDetailTab(page)
      await expect(page.getByTestId('object-detail')).toBeVisible()
      await expect(page.getByTestId('object-detail')).toContainText(firstNumber)

      await rowFor(page, first.id).click({ button: 'right' })
      await page.getByTestId('context-menu').getByRole('menuitem', { name: /^Delete/ }).click()
      const dialog = page.getByTestId('delete-object-dialog')
      await expect(dialog).toBeVisible()
      await dialog.getByTestId('confirm-delete-object').click()
      await expect(dialog).toBeHidden()

      await expect(page.getByTestId('detail-deleted')).toBeVisible()
      await expect(page.getByTestId('detail-deleted')).toContainText('This object was deleted.')
      await expect(page.getByTestId('object-detail')).toHaveCount(0)
      await expect(page.getByTestId('object-draft-bar')).toHaveCount(0)
      await expectNoGraphOrValidationCopy(page)
      await page.screenshot({ path: testInfo.outputPath('row217-detail-deleted.png') })

      // K3: reads for the deleted id stop refetching after the delete settles.
      const afterDeleteReads = objectReads.length
      await page.waitForTimeout(2_000)
      expect(objectReads.length, 'deleted object reads do not repeat').toBe(afterDeleteReads)

      await rowFor(page, second.id).click()
      await expect(page.getByTestId('object-detail')).toBeVisible()
      await expect(page.getByTestId('object-detail')).toContainText(secondNumber)
      await expect(page.getByTestId('detail-deleted')).toHaveCount(0)
      await expectNoGraphOrValidationCopy(page)
      await page.screenshot({ path: testInfo.outputPath('row217-detail-next-object.png') })
    } finally {
      await page.request.delete(`/v1/objects/${first.id}`).catch(() => undefined)
      await page.request.delete(`/v1/objects/${second.id}`).catch(() => undefined)
    }
  })

  test('K5: restoring from Trash unlocks Detail without reload', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const stamp = Date.now().toString().slice(-7)
    const number = `R217B-${stamp}`
    await login(page)
    const product = await createProduct(page, number)
    try {
      await openProducts(page)
      await filterTo(page, number)
      await rowFor(page, product.id).click()
      await openDetailTab(page)
      await expect(page.getByTestId('object-detail')).toBeVisible()
      await expect(page.getByTestId('object-detail')).toContainText(number)

      await rowFor(page, product.id).click({ button: 'right' })
      await page.getByTestId('context-menu').getByRole('menuitem', { name: /^Delete/ }).click()
      const dialog = page.getByTestId('delete-object-dialog')
      await dialog.getByTestId('confirm-delete-object').click()
      await expect(dialog).toBeHidden()
      await expect(page.getByTestId('detail-deleted')).toBeVisible()
      await expect(page.getByTestId('detail-deleted')).toContainText('This object was deleted.')

      await page.getByTestId('user-menu').click()
      await page.getByTestId('user-menu-trash').click()
      const trash = page.getByTestId('trash-dialog')
      await expect(trash).toBeVisible()
      const item = trash.locator('li').filter({ hasText: number }).first()
      await expect(item).toBeVisible()
      await item.getByRole('button', { name: 'Restore' }).click()
      await expect(item).toHaveCount(0)

      await expect(page.getByTestId('detail-deleted')).toHaveCount(0)
      await expect(page.getByTestId('object-detail')).toBeVisible()
      await expect(page.getByTestId('object-detail')).toContainText(number)
      await expectNoGraphOrValidationCopy(page)
      await page.screenshot({ path: testInfo.outputPath('row217b-trash-restore-detail.png') })
    } finally {
      await page.request.delete(`/v1/objects/${product.id}`).catch(() => undefined)
    }
  })
})