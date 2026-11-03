import { expect, test, type Page } from '@playwright/test'
import { dump } from 'js-yaml'
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

/** The first case changes only the model documents. */
function applyableOnly(yaml: string) {
  return yaml
    .split(/\n---\n/)
    .filter((document) => /^kind: (Model|ValueList|UnitFamily)$/m.test(document))
    .join('\n---\n')
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
  const yaml = applyableOnly(await exportYaml(page))
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
  await expect(dialog.getByText('Close', { exact: true })).toBeVisible()
})

test('a config drop applies catalog, merge profile and ownership documents', async ({ page }) => {
  await login(page)
  const suffix = Date.now().toString(36)
  const catalogKey = `drop-source-${suffix}`
  const profileKey = `drop-profile-${suffix}`

  const ownership = await page.request.get('/v1/merge/ownership')
  expect(ownership.ok()).toBeTruthy()
  const rules = (await ownership.json()) as unknown[]
  const documents = [
    {
      apiVersion: 'braian.io/v1',
      kind: 'Catalog',
      key: catalogKey,
      name: `Drop source ${suffix}`,
      catalogKind: 'source',
      editable: true,
    },
    {
      apiVersion: 'braian.io/v1',
      kind: 'MergeProfile',
      key: profileKey,
      name: `Drop profile ${suffix}`,
      sourceCatalog: catalogKey,
      spec: {
        match_attributes: ['number'],
        master_key: 'number',
        attributes: [{ source: 'brand', target: 'brand' }],
        on_no_match: 'create',
        on_delete: 'ignore',
      },
      runMode: 'manual',
    },
    {
      apiVersion: 'braian.io/v1',
      kind: 'Ownership',
      rules: [...rules, { attribute: 'brand', profiles: [profileKey] }],
    },
  ]
  const yaml = documents.map((document) => `---\n${dump(document)}`).join('')
  await dropFile(page, 'catalog.yaml', yaml)
  const dialog = page.getByTestId('config-apply-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('config-plan-catalog')).toBeVisible()
  await expect(dialog.getByTestId('config-plan-merge_profile')).toBeVisible()
  await expect(dialog.getByTestId('config-plan-ownership')).toBeVisible()

  await dialog.getByRole('button', { name: 'Create proposal' }).click()
  await expect(dialog).toContainText('Proposal created')
  await dialog.getByRole('button', { name: 'Open in Review' }).click()
  await expect(page.getByTestId('proposal')).toBeVisible()

  const proposals = await page.request.get('/v1/proposals')
  expect(proposals.ok()).toBeTruthy()
  const list = (await proposals.json()) as { proposals?: { id?: string; title?: string }[] }
  const proposal = list.proposals?.find((row) => row.title === 'Config apply')
  expect(proposal?.id).toBeTruthy()
  const accepted = await page.request.post(`/v1/proposals/${proposal?.id}/accept`, { data: {} })
  expect(accepted.ok()).toBeTruthy()
  const acceptedBody = (await accepted.json()) as { failed?: unknown[] }
  expect(acceptedBody.failed ?? []).toHaveLength(0)

  const profiles = await page.request.get('/v1/merge/profiles')
  expect(profiles.ok()).toBeTruthy()
  expect(await profiles.text()).toContain(profileKey)
})
