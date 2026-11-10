// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { copy } from './i18n'
import { ProposalBulkActions } from './proposal-actions'
import { ProposalView, type PanesSession } from './panes'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  return { methods, use }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

let proposal: Json

function Host() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  const session = useMemo<PanesSession>(
    () => ({
      group: null,
      objectId: null,
      proposalId: 'p1',
      language: 'en',
      setGroup: () => undefined,
      setObjectId: () => undefined,
      setProposalId: () => undefined,
      push: () => undefined,
    }),
    [],
  )
  return (
    <QueryClientProvider client={client}>
      <ProposalView session={session} />
    </QueryClientProvider>
  )
}

function row(id: string, status: string) {
  return {
    id,
    object_id: `obj-${id}`,
    type_key: 'item',
    status,
    patch: { values: { name: { en: 'New' } } },
  }
}

function disabled(testId: string) {
  return (screen.getByTestId(testId) as HTMLButtonElement).disabled
}

function opacity(testId: string) {
  const value = getComputedStyle(screen.getByTestId(testId)).opacity
  return Number(value || 1)
}

function stylesPath() {
  const candidates = [join(process.cwd(), 'src/styles.css'), join(process.cwd(), 'apps/web/src/styles.css')]
  const found = candidates.find((path) => existsSync(path))
  if (!found) throw new Error(`styles.css not found from ${process.cwd()}`)
  return found
}

/** Load the real disabled-action rules. jsdom does not read the Vite bundle. */
function installActionButtonStyles() {
  const css = readFileSync(stylesPath(), 'utf8')
  const start = css.indexOf('/* Disabled action buttons (row 212) */')
  const end = css.indexOf('/* End disabled action buttons (row 212) */')
  if (start < 0 || end < start) throw new Error('disabled action button styles missing')
  const style = document.createElement('style')
  style.id = 'proposal-action-disabled-styles'
  style.textContent = css.slice(start, end)
  document.head.appendChild(style)
}

function expectClosedActions(reason: string) {
  expect(disabled('save-all')).toBe(true)
  expect(disabled('discard-all')).toBe(true)
  expect(opacity('save-all')).toBe(0.8)
  expect(opacity('discard-all')).toBe(0.8)
  const explanation = screen.getByTestId('proposal-actions-reason')
  expect(explanation.textContent).toBe(reason)
  expect(explanation.getAttribute('title')).toBe(reason)
  expect(screen.getByTestId('save-all').getAttribute('aria-describedby')).toBe(explanation.id)
  expect(screen.getByTestId('discard-all').getAttribute('aria-describedby')).toBe(explanation.id)
}

beforeEach(() => {
  installActionButtonStyles()
  mock.use((path: string) => {
    if (path === '/v1/proposals') return Promise.resolve({ proposals: [proposal] })
    if (path === '/v1/proposals/{id}') return Promise.resolve(proposal)
    if (path === '/v1/definitions') return Promise.resolve({ languages: ['en'], types: [], attributes: [], structures: [] })
    return Promise.resolve({})
  })
})

afterEach(() => {
  cleanup()
  document.getElementById('proposal-action-disabled-styles')?.remove()
})

describe('closed proposal bulk actions', () => {
  it('disables and explains Save all and Discard all on an accepted proposal', async () => {
    proposal = { id: 'p1', title: 'Accepted', status: 'accepted', rows: [row('r1', 'accepted')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(true))
    expectClosedActions(copy.proposalAlreadyAccepted)
  })

  it('disables and explains Save all and Discard all on a discarded proposal', async () => {
    proposal = { id: 'p1', title: 'Discarded', status: 'discarded', rows: [row('r1', 'rejected')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(true))
    expectClosedActions(copy.proposalAlreadyDiscarded)
  })

  it('disables and explains both actions on a closed proposal with accepted and rejected rows', async () => {
    proposal = {
      id: 'p1',
      title: 'Mixed',
      status: 'accepted',
      rows: [row('r1', 'accepted'), row('r2', 'rejected')],
    }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('discard-all')).toBe(true))
    expectClosedActions(copy.proposalAlreadyClosed)
  })

  it('keeps Save all and Discard all enabled with no closed explanation while a row is pending', async () => {
    proposal = { id: 'p1', title: 'Open', status: 'open', rows: [row('r1', 'pending')] }
    render(<Host />)
    await screen.findByTestId('save-all')
    await waitFor(() => expect(disabled('save-all')).toBe(false))
    expect(disabled('discard-all')).toBe(false)
    expect(opacity('save-all')).toBe(1)
    expect(opacity('discard-all')).toBe(1)
    expect(screen.queryByTestId('proposal-actions-reason')).toBeNull()
    expect(screen.getByTestId('save-all').getAttribute('aria-describedby')).toBeNull()
    expect(screen.getByTestId('discard-all').getAttribute('aria-describedby')).toBeNull()
  })

  it('uses the same disabled look and explanation in the Ctrl+K proposal preview', () => {
    render(
      <ProposalBulkActions
        rows={[row('r1', 'accepted'), row('r2', 'rejected')]}
        saveDisabled
        discardDisabled
        discardFirst
        saveVariant="primary"
        saveTestId="palette-save-all"
        discardTestId="palette-discard-all"
        reasonTestId="palette-proposal-reason"
        onSave={() => undefined}
        onDiscard={() => undefined}
      />,
    )
    expect(opacity('palette-save-all')).toBe(0.8)
    expect(opacity('palette-discard-all')).toBe(0.8)
    const explanation = screen.getByTestId('palette-proposal-reason')
    expect(explanation.textContent).toBe(copy.proposalAlreadyClosed)
    expect(screen.getByTestId('palette-save-all').getAttribute('aria-describedby')).toBe(explanation.id)
    expect(screen.getByTestId('palette-discard-all').getAttribute('aria-describedby')).toBe(explanation.id)
  })
})
