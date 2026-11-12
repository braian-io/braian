// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerCommandRunner } from './command-registry'
import { CommandPalette } from './palette'
import { dispatchUi, onUi } from './ui-bus'
import {
  publishColumnPrefsOverride,
  publishColumns,
  publishFrame,
  resetUiContext,
} from './ui-context'

const PRODUCTS = 'v-products'
const DETAIL = 'v-detail'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function PaletteHost({ focusViewId }: { focusViewId?: string | null }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo(
    () => ({
      objectId: null as string | null,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
      openWorkspace: () => undefined,
      openTypeView: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={client}>
      <CommandPalette
        session={session}
        workspaces={[]}
        views={[
          { id: PRODUCTS, title: 'Products', type: 'object_table' },
          { id: DETAIL, title: 'Detail', type: 'object_detail' },
        ]}
        focusViewId={focusViewId}
        onClose={() => undefined}
      />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  resetUiContext()
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
      if (url.includes('/v1/definitions')) return json({ types: [], attributes: [] })
      if (url.includes('/v1/search')) return json({ found: 0, hits: [] })
      if (url.includes('/v1/frecency')) return json({ entries: {} })
      if (url.includes('/v1/proposals')) return json({ pending: { total: 0 } })
      return json({})
    }),
  )
})

describe('Reset to default in Ctrl+K when a panel is maximized (row 51a)', () => {
  it('targets the published zoomed table, not the hidden sibling document focus', async () => {
    // publishFrame (shell.tsx) remaps focus to doc.zoom when it is set, so the
    // published frame focuses Products while the raw document focus is Detail.
    publishFrame({
      workspace: { id: 'ws-products', name: 'Products' },
      panes: [{ id: PRODUCTS, type: 'object_table', title: 'Products', focused: true }],
      focused: PRODUCTS,
      language: 'en',
    })
    publishColumns(PRODUCTS, [
      { id: 'number', header: 'Number', hidden: false },
      { id: 'name', header: 'Name', hidden: false },
      { id: 'brand', header: 'Brand', hidden: true },
    ])
    publishColumnPrefsOverride(PRODUCTS, true)

    const reset: string[] = []
    const stopUi = onUi((event) => {
      if (event.name === 'ui.reset_columns') reset.push(String(event.args.view ?? ''))
    })
    // Same shape as the shell runner: it uses the viewId the command received.
    const stopRunner = registerCommandRunner('columns:reset', (target) => {
      if (typeof target.viewId === 'string') {
        dispatchUi('ui.reset_columns', { view: target.viewId })
      }
    })

    render(<PaletteHost focusViewId={DETAIL} />)
    const input = await screen.findByTestId('palette-input')
    fireEvent.change(input, { target: { value: 'Reset to default' } })
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /^Reset to default/ })).toBeTruthy()
    })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(reset).toEqual([PRODUCTS]))
    expect(reset).not.toContain(DETAIL)
    stopRunner()
    stopUi()
  })
})
