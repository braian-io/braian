// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../i18n'
import { DiffTable, MergeProfilesView, MergeRunsView, OwnershipView, mergeValuesSummary, ownershipRulesFromRows } from './views'

const sourceHit = {
  id: 'source-1',
  key: 'ART-1',
  type_key: 'article',
  a_name__en: 'Source one',
}
const masterHit = {
  id: 'master-1',
  key: 'PRD-1',
  type_key: 'product',
  a_name__en: 'Master one',
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DiffTable', () => {
  it('shows English headers and keeps the row testids', () => {
    render(<DiffTable rows={[{ source_key: 'ART-1', master_key: 'PRD-1', action: 'create' }]} />)
    const header = screen.getByTestId('merge-header')
    expect(header.textContent).toContain(copy.mergeAction)
    expect(header.textContent).toContain(copy.mergeSource)
    expect(header.textContent).toContain(copy.mergeMaster)
    expect(header.textContent).toContain(copy.mergeValues)
    expect(header.textContent).toContain(copy.mergeErrors)
    expect(screen.getByTestId('merge-row-create')).toBeTruthy()
    expect(screen.getByTestId('merge-preview')).toBeTruthy()
  })

  it('summarizes values until the row is expanded', () => {
    const values = { name: 'Mature cheddar', brand: 'Acme', nested: { weight: 400 } }
    render(<DiffTable rows={[{ source_key: 'ART-1', action: 'update', detail: { values } }]} />)

    const summary = screen.getByTestId('merge-values-summary')
    expect(summary.textContent).toBe(mergeValuesSummary(values))
    expect(summary.textContent).toContain('Mature cheddar')
    expect(screen.queryByTestId('merge-values-expand')).toBeNull()

    fireEvent.click(summary)
    const expanded = screen.getByTestId('merge-values-expand')
    expect(expanded.textContent).toContain('"nested"')
    expect(expanded.textContent).toContain('\n')
  })
})

describe('MergeRunsView pickers', () => {
  let writes: Array<{ path: string; body: Record<string, unknown> }>

  beforeEach(() => {
    writes = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost')
        if (url.pathname === '/v1/merge/profiles') {
          return json([{ key: 'sap-brand', name: 'SAP brand', mode: 'manual' }])
        }
        if (url.pathname === '/v1/merge/profiles/sap-brand/rows') return json([])
        if (url.pathname === '/v1/search') {
          const query = (url.searchParams.get('q') ?? '').toUpperCase()
          const doc = query.includes('PRD') ? masterHit : sourceHit
          return json({ found: 1, hits: [{ document: doc }] })
        }
        if (url.pathname === '/v1/merge/links' || url.pathname === '/v1/merge/links/remove') {
          writes.push({ path: url.pathname, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
          return json({ ok: true })
        }
        return json({})
      }),
    )
  })

  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MergeRunsView />
      </QueryClientProvider>,
    )
  }

  async function choose(testId: string, query: string, expected: string) {
    const input = screen.getByTestId(testId)
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: query } })
    const option = await screen.findByTestId(`${testId}-option`)
    expect(option.textContent).toContain(expected)
    fireEvent.click(option)
    await waitFor(() => expect((screen.getByTestId(testId) as HTMLInputElement).value).toContain(expected))
  }

  it('sets the source and master ids used by the link request', async () => {
    mount()
    await choose('merge-source-picker', 'ART', 'ART-1')
    await choose('merge-master-picker', 'PRD', 'PRD-1')

    fireEvent.click(screen.getByText(copy.linkObjects))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/v1/merge/links')
    expect(writes[0].body).toMatchObject({
      profile: 'sap-brand',
      source_object_id: 'source-1',
      master_object_id: 'master-1',
    })
  })

  it('sends only the source id when unlinking', async () => {
    mount()
    await choose('merge-source-picker', 'ART', 'ART-1')

    fireEvent.click(screen.getByText(copy.unlinkObjects))

    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0].path).toBe('/v1/merge/links/remove')
    expect(writes[0].body).toMatchObject({ profile: 'sap-brand', source_object_id: 'source-1' })
    expect(writes[0].body).not.toHaveProperty('master_object_id')
  })
})

describe('OwnershipView structured editor', () => {
  let writes: unknown[]

  beforeEach(() => {
    writes = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost')
        if (url.pathname === '/v1/merge/ownership' && (init?.method ?? 'GET') === 'GET') {
          return json([{ attribute: 'brand', profiles: ['sap-brand'], language: 'en' }])
        }
        if (url.pathname === '/v1/merge/ownership' && init?.method === 'POST') {
          writes.push(JSON.parse(String(init.body ?? 'null')))
          return json({ revision: 2 })
        }
        return json({})
      }),
    )
  })

  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <OwnershipView />
      </QueryClientProvider>,
    )
  }

  it('edits structured rows, preserves language, and posts the API rule shape after an app dialog confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    mount()

    const attribute = await screen.findByTestId('ownership-attribute-0') as HTMLInputElement
    expect(attribute.value).toBe('brand')
    fireEvent.change(attribute, { target: { value: 'name' } })
    fireEvent.change(screen.getByTestId('ownership-profiles-0'), {
      target: { value: 'sap-brand, supplier-nordic' },
    })

    fireEvent.click(screen.getByTestId('ownership-save'))
    expect(await screen.findByTestId('ownership-confirm')).toBeTruthy()
    expect(confirm).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('ownership-confirm-save'))
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toEqual([{ attribute: 'name', language: 'en', profiles: ['sap-brand', 'supplier-nordic'] }])
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('adds and removes structured rows', async () => {
    mount()
    await screen.findByTestId('ownership-attribute-0')

    fireEvent.click(screen.getByTestId('ownership-add-rule'))
    const added = await screen.findByTestId('ownership-attribute-1') as HTMLInputElement
    fireEvent.change(added, { target: { value: 'description' } })
    fireEvent.change(screen.getByTestId('ownership-profiles-1'), { target: { value: 'sap-brand' } })
    expect(ownershipRulesFromRows([
      { id: 'a', attribute: 'brand', profiles: 'sap-brand' },
      { id: 'b', attribute: 'description', profiles: 'sap-brand' },
    ])).toEqual([
      { attribute: 'brand', profiles: ['sap-brand'] },
      { attribute: 'description', profiles: ['sap-brand'] },
    ])

    fireEvent.click(screen.getByTestId('ownership-remove-0'))
    expect(screen.queryByTestId('ownership-attribute-1')).toBeNull()
  })
})

describe('MergeProfilesView labels', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost')
        if (url.pathname === '/v1/merge/profiles') return json([])
        if (url.pathname === '/v1/catalogs') {
          return json([{ id: 'catalog-sap', key: 'sap', name: 'SAP ERP', kind: 'source' }])
        }
        return json({})
      }),
    )
  })

  it('shows visible labels, help text and human-readable option labels', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MergeProfilesView />
      </QueryClientProvider>,
    )

    expect(screen.getByLabelText(copy.profileKey)).toBeTruthy()
    expect(screen.getByLabelText(copy.profileName)).toBeTruthy()
    expect(screen.getByLabelText(copy.sourceCatalog)).toBeTruthy()
    expect(screen.getByLabelText(copy.mergeMode)).toBeTruthy()
    expect(screen.getByLabelText(copy.schedule)).toBeTruthy()
    expect(screen.getByLabelText(copy.matchAttribute)).toBeTruthy()
    expect(screen.getByLabelText(copy.masterKey)).toBeTruthy()
    expect(screen.getByLabelText(copy.attributeMap)).toBeTruthy()
    expect(screen.getByLabelText(copy.onNoMatch)).toBeTruthy()
    expect(screen.getByLabelText(copy.onDelete)).toBeTruthy()
    expect(screen.getByLabelText(copy.ownsExistence)).toBeTruthy()
    expect(screen.getByText(copy.mergeModeHint)).toBeTruthy()
    expect(screen.getByText(copy.scheduleHint)).toBeTruthy()

    const mode = screen.getByLabelText(copy.mergeMode) as HTMLSelectElement
    expect(mode.textContent).toContain(copy.modeManual)
    expect(mode.textContent).toContain(copy.modeContinuous)
    const noMatch = screen.getByLabelText(copy.onNoMatch) as HTMLSelectElement
    expect(noMatch.textContent).toContain(copy.onNoMatchSkip)
    expect(noMatch.textContent).toContain(copy.onNoMatchCreate)
    const onDelete = screen.getByLabelText(copy.onDelete) as HTMLSelectElement
    expect(onDelete.textContent).toContain(copy.onDeleteIgnore)
    expect(onDelete.textContent).toContain(copy.onDeletePropagate)
    expect(mode.querySelector('option[value="manual"]')?.textContent).toBe(copy.modeManual)
    expect(noMatch.querySelector('option[value="skip"]')?.textContent).toBe(copy.onNoMatchSkip)
    expect(onDelete.querySelector('option[value="propagate"]')?.textContent).toBe(copy.onDeletePropagate)
  })
})

