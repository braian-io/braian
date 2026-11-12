// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectTable, type PanesSession } from './panes'

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, index) => ({
        index,
        start: index * 28,
        size: 28,
        end: (index + 1) * 28,
        key: index,
        lane: 0,
      })),
    getTotalSize: () => options.count * 28,
    scrollToIndex: () => undefined,
  }),
}))

const product = '018f0000-0000-7000-8000-000000000200'
const fatId = '018f0000-0000-7000-8000-000000000130'
const family = '018f0000-0000-7000-8000-000000000011'
const fatField = `a_${fatId.replaceAll('-', '_')}`

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function ValueUnitTable() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId: null,
      proposalId: null,
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <ObjectTable
        session={session}
        view={{
          id: '018f0000-0000-7000-8000-000000000999',
          type: 'object_table',
          title: 'Products',
          state: {
            object_type: product,
            type_key: 'product',
            table: {
              order: [
                'sku',
                'fat_content',
                'fat_content.value',
                'fat_content.unit',
                'fat_content#unit:kg',
              ],
            },
          },
        }}
        workspace={{ id: 'ws' }}
      />
    </QueryClientProvider>
  )
}

describe('measured value and unit columns in the table', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/objects:pathValues')) {
          const body = JSON.parse(String(init?.body ?? '{}'))
          expect(body.ids).toEqual(['row-1'])
          expect(body.paths).toEqual([
            {
              path: 'fat_content',
              key: 'fat_content#unit:kg',
              unit: 'kg',
            },
          ])
          return json({ values: { 'row-1': { 'fat_content#unit:kg': ['0.035 kg'] } } })
        }
        if (url.includes('/column-prefs')) return json({ document: null })
        if (url.includes('/attribute-paths')) {
          return json({
            paths: [
              { text: 'sku', label: 'SKU' },
              { text: 'fat_content', label: 'Fat content' },
              { text: 'fat_content.value', label: 'Fat content (value)' },
              { text: 'fat_content.unit', label: 'Fat content (unit)' },
            ],
            system_columns: [],
          })
        }
        if (url.includes('/v1/search')) {
          return json({
            found: 1,
            page: 1,
            hits: [
              {
                document: {
                  id: 'row-1',
                  key: 'PROD-1',
                  type_key: 'product',
                  version: 1,
                  [fatField]: 35,
                  [`${fatField}__unit`]: 'g',
                },
              },
            ],
          })
        }
        if (url.includes('/v1/definitions')) {
          return json({
            languages: ['en'],
            unit_families: [
              {
                id: family,
                key: 'mass',
                base_unit: 'g',
                units: [
                  { code: 'g', factor: '1' },
                  { code: 'kg', factor: '1000' },
                ],
              },
            ],
            types: [
              {
                id: product,
                key: 'product',
                labels: { en: 'Product' },
                singular: { en: 'Product' },
                plural: { en: 'Products' },
                key_attribute: 'sku',
                attributes: [fatId],
              },
            ],
            attributes: [
              {
                id: fatId,
                key: 'fat_content',
                labels: { en: 'Fat content' },
                kind: { type: 'number', unit_family: family },
                index: { searchable: false, filterable: true, sortable: true },
              },
            ],
            structures: [],
          })
        }
        if (url.includes('/v1/assortments')) return json({ assortments: [] })
        if (url.includes('/v1/proposals')) return json({ pending: { total: 0 } })
        if (url.includes('/v1/views')) return json({})
        return json({})
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps the combined, value, unit and converted columns apart after load', async () => {
    render(<ValueUnitTable />)
    await waitFor(() =>
      expect(screen.getByTestId('col-fat_content.value').textContent).toContain('Fat content (value)'),
    )
    const row = screen.getByTestId('object-row')
    const cell = (id: string) => row.querySelector(`[data-column="${id}"]`)?.textContent ?? ''
    expect(cell('fat_content.value')).toBe('35')
    expect(cell('fat_content.unit')).toBe('g')
    expect(cell('fat_content')).toBe('35 g')
    await waitFor(() => expect(cell('fat_content#unit:kg')).toBe('0.035 kg'))
    expect(screen.getByTestId('col-fat_content.unit').textContent).toContain('Fat content (unit)')
    expect(screen.getByTestId('col-fat_content').textContent).toContain('Fat content')
  })
})
