// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { copy } from './i18n'
import { graphDialogStyle, LinkCreateDialog, type LinkCreateRequest } from './link-create-dialog'
import type { LinkSubmitResult } from './link-write'
import type { Json } from './api'

vi.mock('sonner', () => ({ toast: vi.fn() }))

const defs: Json = {
  attributes: [
    { id: 'sort-attr', key: 'sort_order', labels: { en: 'Sort order' }, kind: { type: 'number', integer: true } },
  ],
  types: [
    { id: 'type-article', key: 'article', kind: 'entity' },
    { id: 'type-product', key: 'product', kind: 'entity' },
    {
      id: 'link-articles',
      key: 'product_articles',
      kind: 'link',
      attributes: ['sort-attr'],
      link: {
        from_types: ['type-product'],
        to_types: ['type-article'],
        from_label: { labels: { en: 'Product' } },
        to_label: { labels: { en: 'Articles' } },
        from_cardinality: 'many',
        to_cardinality: 'one',
      },
    },
  ],
}

const source = { id: 'article-1', typeKey: 'article', key: 'ART-1', name: 'Mature cheddar' }
const target = { id: 'new-product', typeKey: 'product', key: 'PROD-NEW', name: 'New product' }

const get = vi.spyOn(api, 'get')
const patch = vi.spyOn(api, 'patch')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('link create dialog ends and placement', () => {
  it('names both ends with the relation and never shows a UUID', () => {
    render(
      <LinkCreateDialog
        source={{ ...source, key: 'ART-CHOC-100', name: 'Dark chocolate 70% 100 g' }}
        target={{ id: 'supplier-1', typeKey: 'supplier', key: 'SUP-NORTH', name: 'Northmill Foods' }}
        defs={{
          ...defs,
          types: [
            ...(defs.types as Json[]),
            { id: 'type-supplier', key: 'supplier', kind: 'entity' },
            {
              id: 'link-supplier',
              key: 'supplier_articles',
              kind: 'link',
              link: {
                from_types: ['type-supplier'],
                to_types: ['type-article'],
                from_label: { labels: { en: 'Supplier' } },
                to_label: { labels: { en: 'Articles' } },
                from_cardinality: 'many',
                to_cardinality: 'one',
              },
            },
          ],
        }}
        onClose={() => undefined}
        onConfirm={async () => undefined}
      />,
    )
    const ends = screen.getByTestId('link-ends')
    expect(ends.textContent).toBe(
      'ART-CHOC-100 · Dark chocolate 70% 100 g — Supplier — SUP-NORTH · Northmill Foods',
    )
    expect(ends.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it('docks a graph dialog to the corner opposite the node and leaves Detail centred', () => {
    const originalWidth = window.innerWidth
    const originalHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })
    try {
      expect(graphDialogStyle(undefined, undefined)).toBeUndefined()
      const style = graphDialogStyle(
        { left: 1284, top: 421, right: 1398, bottom: 487 },
        { left: 400, top: 100, right: 1440, bottom: 860 },
      )
      expect(style?.left).toBe('24px')
      expect(style?.right).toBe('auto')
      expect(style?.top).toBe('auto')
      expect(style?.bottom).toBe('24px')
      expect(style?.translate).toBe('none')
      const left = Number(String(style?.left).replace('px', ''))
      const bottom = Number(String(style?.bottom).replace('px', ''))
      const width = Number(String(style?.maxWidth).replace('px', ''))
      expect(left + width).toBeLessThanOrEqual(1284)
      expect(left + width).toBeLessThanOrEqual(1440)
      expect(bottom).toBeGreaterThan(0)
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight })
    }
  })
})

describe('link create dialog validation', () => {
  it('keeps a non-numeric sort order in the dialog and does not write', async () => {
    const onConfirm = vi.fn(async () => undefined)
    render(
      <LinkCreateDialog source={source} target={target} defs={defs} onClose={() => undefined} onConfirm={onConfirm} />,
    )
    const field = screen.getByTestId('link-field-sort_order') as HTMLInputElement
    expect(field.inputMode).toBe('decimal')
    expect(field.getAttribute('data-kind')).toBe('number')
    fireEvent.change(field, { target: { value: 'test' } })
    fireEvent.click(screen.getByTestId('link-create-confirm'))
    await waitFor(() => expect(screen.getByTestId('link-field-error-sort_order').textContent).toBe(copy.linkFieldNumber))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByTestId('link-create-dialog')).toBeTruthy()
  })

  it('offers to retarget the existing link when the cardinality is full', async () => {
    const requests: LinkCreateRequest[] = []
    const result: LinkSubmitResult = {
      outcome: 'partial',
      created: [],
      failed: {
        body: { type: 'product_articles', from_id: 'new-product', to_id: 'article-1', values: {} },
        message: 'link type product_articles allows one link on that side',
        status: 409,
        code: 'link_cardinality',
      },
    }
    get.mockImplementation(async (path) => {
      if (path === '/v1/links') {
        return [{ link_type: 'product_articles', links: [{ id: 'old-link', peer_id: 'old-product' }] }] as never
      }
      return { version: 3 } as never
    })
    patch.mockResolvedValue({ version: 4 } as never)
    const onClose = vi.fn()
    const onReplaced = vi.fn()
    render(
      <LinkCreateDialog
        source={source}
        target={target}
        defs={defs}
        onClose={onClose}
        onConfirm={async () => undefined}
        onConfirmMany={async (next) => {
          requests.push(...next)
          return result
        }}
        onReplaced={onReplaced}
      />,
    )
    fireEvent.click(screen.getByTestId('link-create-confirm'))
    const conflict = await screen.findByTestId('link-cardinality')
    expect(conflict.textContent).toContain('This article already has a product link')
    expect(screen.queryByTestId('link-create-confirm')).toBeNull()
    fireEvent.click(screen.getByTestId('link-replace'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(requests[0]).toMatchObject({ type: 'product_articles', fromId: 'new-product', toId: 'article-1' })
    expect(patch).toHaveBeenCalledWith('/v1/links/{id}', {
      params: { path: { id: 'old-link' }, header: { 'If-Match': 3 } },
      body: { from_id: 'new-product', to_id: 'article-1', values: {} },
    })
    expect(onReplaced).toHaveBeenCalledTimes(1)
  })
})
