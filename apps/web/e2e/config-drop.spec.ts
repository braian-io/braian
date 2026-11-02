import { expect, test, type Page } from '@playwright/test'
import { demoCredentials } from './demo'
import { mainTable } from './ui'

async function login(page: Page) {
  const demo = demoCredentials()
  await page.goto('/')
  await page.getByTestId('email').fill(demo.email)
  await page.getByTestId('password').fill(demo.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(mainTable(page)).toBeVisible()
}

async function exportYaml(page: Page) {
  const exported = await page.request.get('/v1/config/export?format=yaml')
  expect(exported.ok()).toBeTruthy()
  return exported.text()
}

/** Change the first attribute label so the plan has one Model update. */
function changeAttributeLabel(yaml: string) {
  const lines = yaml.split('\n')
  const attributes = lines.findIndex((line) => /^attributes:\s*$/.test(line))
  expect(attributes).toBeGreaterThan(-1)
  const label = lines.findIndex((line, index) => index > attributes && /^\s+en:\s*\S/.test(line))
  expect(label).toBeGreaterThan(attributes)
  const indentation = lines[label]?.match(/^(\s*)en:/)?.[1] ?? ''
  lines[label] = `${indentation}en: Config drop e2e`
  return lines.join('\n')
}

async function dropFile(page: Page, name: string, content: string) {
  await page.evaluate(({ name, content }) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([content], name, { type: 'application/yaml' }))
    for (const type of ['dragenter', 'dragover', 'drop']) {
      window.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }))
    }
  }, { name, content })
}

test('a config drop plans, creates a proposal and opens Review', async ({ page }) => {
  await login(page)
  const yaml = await exportYaml(page)
  const changed = changeAttributeLabel(yaml)
  expect(changed).not.toBe(yaml)

  await dropFile(page, 'model.yaml', changed)
  const dialog = page.getByTestId('config-apply-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Apply configuration')
  await expect(dialog).toContainText('model.yaml')
  const model = dialog.getByTestId('config-plan-model')
  await expect(model).toContainText('Model')
  await expect(model.getByTestId('config-plan-step').filter({ hasText: 'Update' }).first()).toBeVisible()

  await dialog.getByRole('button', { name: 'Create proposal' }).click()
  await expect(dialog).toContainText('Proposal created')
  await dialog.getByRole('button', { name: 'Open in Review' }).click()

  const review = page.getByTestId('proposal')
  await expect(review).toBeVisible()
  await expect(review).toContainText('Config apply')
})

test('an unchanged config export shows no changes', async ({ page }) => {
  await login(page)
  const yaml = await exportYaml(page)

  await dropFile(page, 'model.yaml', yaml)
  const dialog = page.getByTestId('config-apply-dialog')
  await expect(dialog).toContainText('No changes')
  await expect(dialog.getByRole('button', { name: 'Create proposal' })).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeVisible()
})
