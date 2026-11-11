// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import { ConsequenceHost, typesLosingAllowedTree } from './consequence'
import { copy } from './i18n'
import { publishProposal } from './proposal-bus'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  const use = (impl: (path: string, init?: { body?: unknown; params?: { path?: Record<string, string> } }) => unknown) => {
    for (const fn of Object.values(methods)) fn.mockReset().mockImplementation(impl)
  }
  const calls = () => Object.values(methods).flatMap((fn) => fn.mock.calls)
  return { methods, use, calls }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

const proposal: Json = {
  title: 'Delete type',
  source: 'user',
  rows: [],
  consequence: {
    lines: ['Delete type recipe'],
    warnings: [],
    samples: [],
    jobs: [],
    definition_errors: [],
    destructive: true,
    confirm_name: 'Recipe',
    affected_objects: 0,
  },
}

function Host({ push = () => undefined }: { push?: (line: string) => void }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return (
    <QueryClientProvider client={client}>
      <button type="button" data-testid="open-delete">Delete</button>
      <ConsequenceHost session={{ setProposalId: () => undefined, push }} />
    </QueryClientProvider>
  )
}

describe('consequence dialog', () => {
  beforeEach(() => {
    mock.use((path) => {
      if (path === '/v1/definitions') return Promise.resolve({ languages: ['en'], types: [] })
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(proposal)
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('closes on Escape without discarding the change and returns focus', async () => {
    render(<Host />)
    const opener = screen.getByTestId('open-delete')
    opener.focus()
    publishProposal('proposal-1')
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByTestId('consequence')).toBeTruthy()
    screen.getByRole('button', { name: 'Cancel' }).focus()
    expect(document.activeElement).not.toBe(opener)

    const underneath = vi.fn()
    window.addEventListener('keydown', underneath)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    window.removeEventListener('keydown', underneath)

    await waitFor(() => expect(screen.queryByTestId('consequence')).toBeNull())
    expect(underneath).not.toHaveBeenCalled()
    const writes = [
      ...mock.methods.post.mock.calls,
      ...mock.methods.put.mock.calls,
      ...mock.methods.patch.mock.calls,
      ...mock.methods.delete.mock.calls,
    ]
    expect(writes).toEqual([])
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('exposes its title and description through the shared dialog', async () => {
    render(<Host />)
    publishProposal('proposal-2')

    const dialog = await screen.findByRole('dialog')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    const description = document.getElementById(dialog.getAttribute('aria-describedby') ?? '')

    expect(title?.textContent).toBe('Delete type')
    expect(description?.textContent).toBe(copy.reviewChange)
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })

  it('names a deleted structure by its label and shows one confirmation', async () => {
    const structureProposal: Json = {
      ...proposal,
      title: 'Delete structure qa129r_0516',
      rows: [{
        id: 'row-1',
        position: 0,
        status: 'pending',
        conflict: false,
        type_key: 'model',
        patch: { op: 'delete_structure', structure: 'structure-food' },
      }],
      consequence: {
        ...(proposal.consequence as Json),
        lines: ['Delete structure qa129r_0516'],
      },
    }
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [],
          structures: [
            { id: 'structure-food', key: 'qa129r_0516', labels: { en: 'Food' }, groups: [] },
          ],
        })
      }
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(structureProposal)
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-structure')

    const dialog = await screen.findByRole('dialog')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    expect(title?.textContent).toBe('Delete structure Food')
    // The title already names the single step; no duplicated Model diff block.
    expect(screen.queryByTestId('model-diff')).toBeNull()
    expect(dialog.textContent).not.toContain('qa129r_0516')
    expect(screen.getByTestId('confirm-delete')).toBeTruthy()
  })

  it('names the operation and hides fake counts while the proposal loads', async () => {
    const structureProposal: Json = {
      ...proposal,
      title: 'Delete structure qa129r_0516',
      rows: [{
        id: 'row-1',
        position: 0,
        status: 'pending',
        conflict: false,
        type_key: 'model',
        patch: { op: 'delete_structure', structure: 'structure-food' },
      }],
      consequence: {
        ...(proposal.consequence as Json),
        lines: ['Delete structure qa129r_0516'],
        affected_objects: 0,
      },
    }
    let release: (() => void) | undefined
    const pending = new Promise<Json>((resolve) => {
      release = () => resolve(structureProposal)
    })
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [],
          structures: [
            { id: 'structure-food', key: 'qa129r_0516', labels: { en: 'Food' }, groups: [] },
          ],
        })
      }
      if (path.startsWith('/v1/proposals/')) return pending
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-loading', 'model.delete_structure')

    const dialog = await screen.findByRole('dialog')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    expect(title?.textContent).toBe('Delete structure')
    expect((screen.getByTestId('confirm-delete') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByTestId('impact-result')).toBeNull()
    expect(screen.queryByTestId('model-diff')).toBeNull()
    expect(dialog.textContent).not.toContain('Affected objects')
    expect(dialog.textContent).not.toContain('Sample:')

    release?.()
    await waitFor(() => expect((screen.getByTestId('confirm-delete') as HTMLButtonElement).disabled).toBe(false))
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent)
      .toBe('Delete structure Food')
    expect(screen.getByTestId('impact-result')).toBeTruthy()
    expect(screen.queryByTestId('model-diff')).toBeNull()
  })
})

describe('empty delete wording', () => {
  afterEach(() => {
    cleanup()
  })

  it('says "No values will be deleted" once and names the types that lose the tree', async () => {
    const structureProposal: Json = {
      ...proposal,
      title: 'Delete structure qa129r_0516',
      rows: [{
        id: 'row-1',
        position: 0,
        status: 'pending',
        conflict: false,
        type_key: 'model',
        patch: { op: 'delete_structure', structure: 'structure-food' },
      }],
      consequence: {
        ...(proposal.consequence as Json),
        lines: ['Delete structure qa129r_0516'],
        detail: ['0 values on 0 objects will be deleted'],
        sentence: '0 values on 0 objects will be deleted',
        values: 0,
        objects: 0,
        links: 0,
        selections: 0,
        affected_objects: 0,
      },
    }
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [
            { id: 'type-product', key: 'product', singular: { en: 'Product' }, structures: ['structure-food'] },
            { id: 'type-article', key: 'article', singular: { en: 'Article' }, structures: [] },
          ],
          structures: [
            { id: 'structure-food', key: 'food', labels: { en: 'Food' }, groups: [] },
          ],
        })
      }
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(structureProposal)
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-empty')

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(screen.getByTestId('delete-counts').textContent).toBe(copy.noValuesDeleted))
    expect(dialog.textContent).not.toContain('0 values on 0 objects')
    expect(dialog.textContent).not.toContain('Affected objects: 0')
    expect(screen.getByTestId('allowed-trees-unlink').textContent)
      .toBe(copy.allowedTreesLinkRemoved.replace('{types}', 'Product'))
  })

  it('finds only the types whose allowed trees still contain the deleted structure', () => {
    const defs: Json = {
      types: [
        { id: 'type-product', key: 'product', singular: { en: 'Product' }, structures: ['structure-food'] },
        { id: 'type-article', key: 'article', singular: { en: 'Article' }, structures: ['structure-market'] },
      ],
      structures: [
        { id: 'structure-food', key: 'food' },
        { id: 'structure-market', key: 'market' },
      ],
    }
    expect(typesLosingAllowedTree(defs, [{ op: 'delete_structure', structure: 'food' }])).toEqual(['Product'])
    expect(typesLosingAllowedTree(defs, [{ op: 'delete_structure', structure: 'structure-market' }])).toEqual(['Article'])
    expect(typesLosingAllowedTree(defs, [{ op: 'delete_type', key: 'product' }])).toEqual([])
  })

  it('does not push a stale Confirm line after a delete', async () => {
    const push = vi.fn()
    mock.use((path) => {
      if (path === '/v1/definitions') return Promise.resolve({ languages: ['en'], types: [] })
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(proposal)
      if (path.endsWith('/accept')) return Promise.resolve({ ok: true })
      return Promise.resolve({})
    })
    render(<Host push={push} />)
    publishProposal('proposal-confirm')
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog.querySelector('[data-testid="confirm-delete"]') as HTMLElement)
    await waitFor(() => expect(screen.queryByTestId('consequence')).toBeNull())
    expect(push).not.toHaveBeenCalledWith(copy.confirm)
  })
})
