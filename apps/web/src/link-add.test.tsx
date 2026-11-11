// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type Json } from './api'
import { chooseLinkChoice, LinkAddFlow } from './link-add'

const defs: Json = {
  types: [
    { id: 't-article', key: 'article', kind: 'entity', labels: { en: 'Article' } },
    { id: 't-supplier', key: 'supplier', kind: 'entity', labels: { en: 'Supplier' } },
    { id: 't-product', key: 'product', kind: 'entity', labels: { en: 'Product' } },
    {
      id: 'l-product-articles',
      key: 'product_articles',
      kind: 'link',
      labels: { en: 'Product' },
      link: {
        from_types: ['t-product'],
        to_types: ['t-article'],
        from_label: { key: 'product', labels: { en: 'Product' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
        from_cardinality: 'many',
        to_cardinality: 'one',
      },
    },
    {
      id: 'l-supplier-articles',
      key: 'supplier_articles',
      kind: 'link',
      labels: { en: 'Supplier' },
      link: {
        from_types: ['t-supplier'],
        to_types: ['t-article'],
        from_label: { key: 'supplier', labels: { en: 'Supplier' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
        from_cardinality: 'many',
        to_cardinality: 'one',
      },
    },
    {
      id: 'l-replaces',
      key: 'replaces',
      kind: 'link',
      labels: { en: 'Replaces' },
      link: {
        from_types: ['t-article'],
        to_types: ['t-article'],
        from_label: { key: 'replaces', labels: { en: 'Replaces' } },
        to_label: { key: 'replaced_by', labels: { en: 'Replaced by' } },
        from_cardinality: 'many',
        to_cardinality: 'one',
      },
    },
  ],
  attributes: [],
  structures: [],
}

function renderFlow(
  request: Parameters<typeof LinkAddFlow>[0]['request'],
  overrides: Partial<Pick<Parameters<typeof LinkAddFlow>[0], 'objectId' | 'typeKey'>> = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LinkAddFlow
        objectId={overrides.objectId ?? 'art-1'}
        typeKey={overrides.typeKey ?? 'article'}
        defs={defs}
        request={request}
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('chooseLinkChoice', () => {
  it('keeps the requested direction instead of the first same-type row', () => {
    const choices = [
      { key: 'replaces', label: 'Replaced by', direction: 'out' as const },
      { key: 'replaces', label: 'Replaces', direction: 'in' as const },
    ]
    expect(chooseLinkChoice(choices, { linkType: 'replaces', direction: 'in' })?.label).toBe('Replaces')
    expect(chooseLinkChoice(choices, { linkType: 'replaces', direction: 'out' })?.label).toBe('Replaced by')
  })

  it('falls back to the first relation when the request names none', () => {
    const choices = [
      { key: 'product_articles', label: 'Product', direction: 'in' as const },
      { key: 'supplier_articles', label: 'Supplier', direction: 'in' as const },
    ]
    expect(chooseLinkChoice(choices, null)?.key).toBe('product_articles')
    expect(chooseLinkChoice(choices, { linkType: 'missing', direction: 'in' })?.key).toBe('product_articles')
  })
})

describe('LinkAddFlow', () => {
  it('opens the picker titled with the relation and its direction', () => {
    renderFlow({ linkType: 'supplier_articles', direction: 'in' })

    expect(screen.getByTestId('link-picker')).toBeTruthy()
    expect(screen.getByTestId('link-picker-relation').textContent).toBe('Supplier · To this object')
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Add link… Supplier')
  })

  it('shows the outgoing side for an out relation', () => {
    renderFlow({ linkType: 'replaces', direction: 'out' })
    expect(screen.getByTestId('link-picker-relation').textContent).toBe('Replaced by · From this object')
  })

  it('chooses a peer and opens the create dialog for the same relation and direction', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      hits: [
        {
          document: {
            id: 'sup-1',
            type_key: 'supplier',
            key: 'SUP-1',
            display_name: 'Supplier one',
          },
        },
      ],
    } as never)
    renderFlow({ linkType: 'supplier_articles', direction: 'in' })

    fireEvent.change(screen.getByTestId('link-search'), { target: { value: 'SUP' } })
    const option = await screen.findByRole('option', { name: /Supplier one/ })
    fireEvent.click(option)

    const dialog = await screen.findByTestId('link-create-dialog')
    expect(dialog).toBeTruthy()
    await waitFor(() =>
      expect(screen.getByTestId('link-type-single').getAttribute('data-choice')).toBe('supplier_articles:in'),
    )
    expect(screen.getByTestId('link-type-single').textContent).toBe('Supplier')
    expect(screen.getByTestId('link-ends').textContent).toContain('SUP-1')
  })

  it('renders nothing when the type has no relation at all', () => {
    renderFlow({ linkType: 'supplier_articles', direction: 'in' }, { typeKey: 'unknown' })
    expect(screen.queryByTestId('link-picker')).toBeNull()
  })
})
