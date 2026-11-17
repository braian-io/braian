// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './palette'
import {
  isOpenStructureRoot,
  openStructureRootItem,
  openStructureSubmenuRows,
  parseOpenStructureChoice,
} from './palette-open-structure'
import { visibleRows } from './palette-model'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined
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
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/v1/definitions')) {
        return new Response(
          JSON.stringify({
            structures: [{ key: 'food', labels: { en: 'Food' }, groups: [{ key: 'dairy' }] }],
            types: [],
            attributes: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.includes('/v1/search')) {
        return new Response(JSON.stringify({ found: 0, hits: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/v1/frecency')) {
        return new Response(JSON.stringify({ entries: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url.includes('/v1/proposals')) {
        return new Response(JSON.stringify({ pending: { total: 0 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
})

describe('open structure palette helpers', () => {
  it('matches open structure, open tree, and struktur', () => {
    const root = openStructureRootItem()
    for (const query of ['open structure', 'open tree', 'structure', 'tree', 'struktur', 'träd', 'öppna']) {
      const rows = visibleRows(query, [root], [], {})
      expect(rows.some((row) => (row.sourceId ?? row.id) === 'layout:open-structure')).toBe(true)
    }
  })

  it('lists structures with label and key', () => {
    const rows = openStructureSubmenuRows({
      structures: [
        { key: 'food', labels: { en: 'Food' } },
        { key: 'size', labels: { en: 'Sizes' } },
      ],
    })
    expect(rows.map((row) => row.id)).toEqual(['open-structure:food', 'open-structure:size'])
    expect(rows[0].title).toBe('Food')
    expect(rows[0].subtitle).toBe('food')
  })

  it('parses submenu choices', () => {
    expect(parseOpenStructureChoice('open-structure:food')).toBe('food')
    expect(parseOpenStructureChoice('layout:open-structure')).toBeNull()
    expect(isOpenStructureRoot('layout:open-structure')).toBe(true)
  })
})

describe('Open structure › in Ctrl+K', () => {
  it('drills in and calls openStructureView with the chosen structure', async () => {
    const opened: Array<{ key: string; zone: string }> = []
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CommandPalette
          session={{
            objectId: null,
            setObjectId: () => undefined,
            setProposalId: () => undefined,
            push: () => undefined,
            openWorkspace: () => undefined,
            openStructureView: (key, placement) => {
              opened.push({ key, zone: placement?.zone ?? 'center' })
            },
          }}
          workspaces={[]}
          views={[]}
          focusViewId="v-table"
          onClose={() => undefined}
        />
      </QueryClientProvider>,
    )
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'open tree' } })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Open structure/ })).toBeTruthy()
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Food/ })).toBeTruthy()
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(opened).toEqual([{ key: 'food', zone: 'center' }]))
  })

  it('opens to the right on Ctrl+Enter', async () => {
    const opened: Array<{ key: string; zone: string }> = []
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <CommandPalette
          session={{
            objectId: null,
            setObjectId: () => undefined,
            setProposalId: () => undefined,
            push: () => undefined,
            openWorkspace: () => undefined,
            openStructureView: (key, placement) => {
              opened.push({ key, zone: placement?.zone ?? 'center' })
            },
          }}
          workspaces={[]}
          views={[]}
          focusViewId="v-table"
          onClose={() => undefined}
        />
      </QueryClientProvider>,
    )
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'open tree' } })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Open structure/ })).toBeTruthy()
    })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Food/ })).toBeTruthy()
    })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(opened).toEqual([{ key: 'food', zone: 'right' }]))
  })
})