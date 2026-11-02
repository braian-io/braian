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

test('config apply waits for approve before the model changes', async ({ page }) => {
  await login(page)
  const key = `config_apply_${Date.now().toString(36)}`

  const exported = await page.request.get('/v1/config/export?format=json')
  expect(exported.ok()).toBeTruthy()
  const documents = (await exported.json()) as {
    kind?: string
    attributes?: unknown[]
  }[]
  const model = documents.find((document) => document.kind === 'Model')
  expect(model).toBeTruthy()
  model?.attributes?.push({
    key,
    languageDependent: false,
    multiple: false,
    kind: { type: 'text', maxLength: 40 },
    index: { searchable: false, filterable: false, sortable: false },
  })

  const applied = await page.request.post('/v1/config/apply', { data: documents })
  expect(applied.status()).toBe(202)
  const proposal = (await applied.json()) as { proposal_id?: string; groups?: unknown }
  expect(proposal.proposal_id).toBeTruthy()
  expect(proposal.groups).toBeTruthy()

  const before = await page.request.get('/v1/definitions')
  expect(before.ok()).toBeTruthy()
  const beforeBody = (await before.json()) as { attributes?: { key?: string }[] }
  expect(beforeBody.attributes?.some((attribute) => attribute.key === key)).toBe(false)

  const accepted = await page.request.post(`/v1/proposals/${proposal.proposal_id}/accept`, {
    data: {},
  })
  expect(accepted.ok()).toBeTruthy()
  const acceptedBody = (await accepted.json()) as { failed?: unknown[] }
  expect(acceptedBody.failed ?? []).toHaveLength(0)

  const after = await page.request.get('/v1/definitions')
  expect(after.ok()).toBeTruthy()
  const afterBody = (await after.json()) as { attributes?: { key?: string }[] }
  expect(afterBody.attributes?.some((attribute) => attribute.key === key)).toBe(true)
})
