// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copy } from '../i18n'
import { DiffTable, MergeRunsView, mergeValuesSummary } from './views'

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
