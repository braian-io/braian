// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './palette'

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function PaletteHarness() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo(
    () => ({
      objectId: 'obj-9',
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
      openWorkspace: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={queryClient}>
      <CommandPalette session={session} workspaces={[]} views={[]} onClose={() => undefined} />
    </QueryClientProvider>
  )
}

describe('palette Home/End in the query field', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    Element.prototype.scrollIntoView = () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/v1/search')) {
          if (url.includes('group=groups')) return json({ groups: [] })
          return json({ found: 0, hits: [] })
        }
        if (url.includes('/v1/workspaces')) return json({ workspaces: [] })
        if (url.includes('/v1/views')) return json({ views: [] })
        if (url.includes('/v1/types')) return json({ types: [] })
        return json({})
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('does not jump the active row on Home/End while the query input is focused', async () => {
    render(<PaletteHarness />)
    const input = (await screen.findByTestId('palette-input')) as HTMLInputElement
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(2))

    // Type first (resets active), then move the list selection — Home must not clear it.
    fireEvent.change(input, { target: { value: 'a' } })
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0))
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const mid = screen.getByTestId('palette-active').textContent
    expect(mid && mid.length > 0).toBe(true)

    const home = createEvent.keyDown(input, { key: 'Home' })
    fireEvent(input, home)
    expect(home.defaultPrevented, 'Home must not be preventDefaulted in the query field').toBe(false)
    expect(screen.getByTestId('palette-active').textContent).toBe(mid)

    const end = createEvent.keyDown(input, { key: 'End' })
    fireEvent(input, end)
    expect(end.defaultPrevented).toBe(false)
    expect(screen.getByTestId('palette-active').textContent).toBe(mid)

    const shiftHome = createEvent.keyDown(input, { key: 'Home', shiftKey: true })
    fireEvent(input, shiftHome)
    expect(shiftHome.defaultPrevented).toBe(false)
    expect(screen.getByTestId('palette-active').textContent).toBe(mid)
  })
})
