// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryView, type PanesSession } from './panes'
import { copy } from './i18n'

const session: PanesSession = {
  group: null,
  objectId: 'object-1',
  proposalId: null,
  language: 'en',
  setGroup: () => undefined,
  setObjectId: () => undefined,
  setProposalId: () => undefined,
  push: () => undefined,
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function Host() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <HistoryView session={session} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('history loading vs empty', () => {
  it('keeps the toolbar visible and waits for the response before showing the empty text', async () => {
    let releaseChanges!: () => void
    const changesGate = new Promise<void>((resolve) => {
      releaseChanges = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/changes')) {
          await changesGate
          return json([])
        }
        if (url.includes('/v1/definitions')) {
          return json({ types: [], attributes: [], unit_families: [], structures: [] })
        }
        return json({})
      }),
    )

    render(<Host />)

    await waitFor(() => expect(screen.getByTestId('history-loading')).toBeTruthy())
    expect(screen.getByTestId('time-travel')).toBeTruthy()
    expect(screen.queryByText(copy.historyEmpty)).toBeNull()
    expect(screen.getByTestId('history-loading').getAttribute('role')).toBe('status')

    releaseChanges()

    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeTruthy())
    expect(screen.getByText(copy.historyEmpty)).toBeTruthy()
    expect(screen.getByTestId('history-empty').getAttribute('role')).toBe('status')
    expect(screen.queryByTestId('history-loading')).toBeNull()
  })
})
