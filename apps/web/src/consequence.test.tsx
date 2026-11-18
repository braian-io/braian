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
    expect(screen.queryByTestId('impact-result')).toBeNull()
    expect(screen.queryByTestId('model-diff')).toBeNull()
  })
})

describe('rollback restore dialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('names the object and shows a field diff without impact noise', async () => {
    const rollbackProposal: Json = {
      title: 'Restore',
      source: 'rollback',
      rows: [{
        id: 'row-1',
        object_id: 'object-1',
        object_key: 'PROD-1',
        type_key: 'product',
        base_version: 4,
        patch: {
          _rollback_seq: 2,
          values: { number: '430' },
        },
        base_values: { name: { en: 'Cola' }, number: '431' },
        status: 'pending',
        conflict: false,
        position: 0,
      }],
      consequence: {
        affected_objects: 0,
        samples: [],
        jobs: [],
      },
    }
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [
            { key: 'number', labels: { en: 'Number' } },
            { key: 'name', labels: { en: 'Name' } },
          ],
        })
      }
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) {
        return Promise.resolve([{ seq: 2, version: 3 }])
      }
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-rollback', 'rollback', { targetSeq: 2 })

    const dialog = await screen.findByTestId('restore-dialog')
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')
    await waitFor(() => {
      expect(title?.textContent).toBe('Restore Cola 431 to version 3?')
    })
    expect(screen.queryByTestId('proposal-source')).toBeNull()
    const diff = screen.getByTestId('field-diff')
    expect(diff.textContent).toContain('Number')
    expect(diff.querySelector('.diff-old')?.textContent).toBe('431')
    expect(diff.textContent).toContain('430')
    expect(screen.queryByTestId('impact-result')).toBeNull()
    expect(dialog.textContent).not.toContain('No job reads these fields.')
    expect(screen.getByTestId('confirm-restore').textContent).toBe('Restore')
  })

  it('closes a Review rollback on Escape without discarding', async () => {
    const rollbackProposal: Json = {
      title: 'Restore',
      source: 'rollback',
      rows: [{
        id: 'row-1',
        object_id: 'object-1',
        object_key: 'PROD-1',
        type_key: 'product',
        base_version: 4,
        patch: {
          _rollback_seq: 2,
          values: { number: '430' },
        },
        base_values: { name: { en: 'Cola' }, number: '431' },
        status: 'pending',
        conflict: false,
        position: 0,
      }],
      consequence: { affected_objects: 0, samples: [], jobs: [] },
    }
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [
            { key: 'number', labels: { en: 'Number' } },
            { key: 'name', labels: { en: 'Name' } },
          ],
        })
      }
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) return Promise.resolve([{ seq: 2, version: 3 }])
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-rollback-review', 'rollback')

    const dialog = await screen.findByTestId('restore-dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('restore-dialog')).toBeNull())
    expect(mock.methods.post).not.toHaveBeenCalled()
  })

  it('discards History rollbacks on Escape', async () => {
    const rollbackProposal: Json = {
      title: 'Restore',
      source: 'rollback',
      rows: [{
        id: 'row-1',
        object_id: 'object-1',
        object_key: 'PROD-1',
        type_key: 'product',
        base_version: 4,
        patch: {
          _rollback_seq: 2,
          values: { number: '430' },
        },
        base_values: { name: { en: 'Cola' }, number: '431' },
        status: 'pending',
        conflict: false,
        position: 0,
      }],
      consequence: { affected_objects: 0, samples: [], jobs: [] },
    }
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [
            { key: 'number', labels: { en: 'Number' } },
            { key: 'name', labels: { en: 'Name' } },
          ],
        })
      }
      if (path === '/v1/proposals/{id}/discard') return Promise.resolve({})
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) return Promise.resolve([{ seq: 2, version: 3 }])
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    render(<Host push={() => undefined} />)
    publishProposal('proposal-rollback-esc', 'rollback', { targetSeq: 2 })

    const dialog = await screen.findByTestId('restore-dialog')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('restore-dialog')).toBeNull())
    expect(mock.methods.post).toHaveBeenCalledWith('/v1/proposals/{id}/discard', {
      params: { path: { id: 'proposal-rollback-esc' } },
    })
  })

  it('ignores Escape while accept is in progress', async () => {
    const rollbackProposal: Json = {
      title: 'Restore',
      source: 'rollback',
      rows: [{
        id: 'row-1',
        object_id: 'object-1',
        object_key: 'PROD-1',
        type_key: 'product',
        base_version: 4,
        patch: {
          _rollback_seq: 2,
          values: { number: '430' },
        },
        base_values: { name: { en: 'Cola' }, number: '431' },
        status: 'pending',
        conflict: false,
        position: 0,
      }],
      consequence: { affected_objects: 0, samples: [], jobs: [] },
    }
    let release: (() => void) | undefined
    const pending = new Promise<Json>((resolve) => {
      release = () => resolve({ ok: true })
    })
    mock.use((path, init) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [
            { key: 'number', labels: { en: 'Number' } },
            { key: 'name', labels: { en: 'Name' } },
          ],
        })
      }
      if (String(path).endsWith('/accept')) return pending
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) return Promise.resolve([{ seq: 2, version: 3 }])
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-rollback-busy', 'rollback', { targetSeq: 2 })

    const dialog = await screen.findByTestId('restore-dialog')
    fireEvent.click(screen.getByTestId('confirm-restore'))
    await waitFor(() => expect((screen.getByTestId('confirm-restore') as HTMLButtonElement).disabled).toBe(true))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.getByTestId('restore-dialog')).toBeTruthy()
    const discardCalls = mock.methods.post.mock.calls.filter(([url]) => String(url).includes('/discard'))
    expect(discardCalls).toEqual([])
    release?.()
    await waitFor(() => expect(screen.queryByTestId('restore-dialog')).toBeNull())
  })

  it('closes after discard 404 and explains 409', async () => {
    const rollbackProposal: Json = {
      title: 'Restore',
      source: 'rollback',
      rows: [{
        id: 'row-1',
        object_id: 'object-1',
        object_key: 'PROD-1',
        type_key: 'product',
        base_version: 4,
        patch: { _rollback_seq: 2, values: { number: '430' } },
        base_values: { name: { en: 'Cola' }, number: '431' },
        status: 'pending',
        conflict: false,
        position: 0,
      }],
      consequence: { affected_objects: 0, samples: [], jobs: [] },
    }
    const { ApiError } = await import('./api')
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [{ key: 'number', labels: { en: 'Number' } }],
        })
      }
      if (path === '/v1/proposals/{id}/discard') return Promise.reject(new ApiError(404, 'missing', null))
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) return Promise.resolve([{ seq: 2, version: 3 }])
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-rollback-404', 'rollback', { targetSeq: 2 })
    await screen.findByTestId('restore-dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('restore-dialog')).toBeNull())
    expect(screen.queryByText(copy.proposalAlreadyClosed)).toBeNull()

    mock.methods.post.mockReset()
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [{ key: 'number', labels: { en: 'Number' } }],
        })
      }
      if (path === '/v1/proposals/{id}/discard') return Promise.reject(new ApiError(409, 'busy', null))
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) return Promise.resolve([{ seq: 2, version: 3 }])
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    publishProposal('proposal-rollback-409', 'rollback', { targetSeq: 2 })
    await screen.findByTestId('restore-dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('restore-dialog')).toBeNull())
  })

  it('disables restore when the diff is empty', async () => {
    const rollbackProposal: Json = {
      title: 'Restore',
      source: 'rollback',
      rows: [{
        id: 'row-1',
        object_id: 'object-1',
        object_key: 'PROD-1',
        type_key: 'product',
        base_version: 2,
        patch: {
          _rollback_seq: 2,
          values: { number: '431' },
        },
        base_values: { name: { en: 'Cola' }, number: '431' },
        status: 'pending',
        conflict: false,
        position: 0,
      }],
      consequence: { affected_objects: 0, samples: [], jobs: [] },
    }
    mock.use((path) => {
      if (path === '/v1/definitions') {
        return Promise.resolve({
          languages: ['en'],
          types: [{ key: 'product', singular: { en: 'Product' } }],
          attributes: [{ key: 'number', labels: { en: 'Number' } }],
        })
      }
      if (path.startsWith('/v1/proposals/')) return Promise.resolve(rollbackProposal)
      if (path.includes('/changes')) return Promise.resolve([{ seq: 2, version: 2 }])
      if (path.includes('/objects/object-1')) {
        return Promise.resolve({ values: { name: { en: 'Cola' }, number: '431' } })
      }
      return Promise.resolve({})
    })
    render(<Host />)
    publishProposal('proposal-rollback-empty', 'rollback', { targetSeq: 2 })

    const dialog = await screen.findByTestId('restore-dialog')
    await waitFor(() => {
      expect((screen.getByTestId('confirm-restore') as HTMLButtonElement).disabled).toBe(true)
    })
    expect(screen.getByTestId('restore-no-changes')).toBeTruthy()
    expect(screen.queryByTestId('field-diff')).toBeNull()
    expect(dialog.textContent).toContain(copy.restoreAlreadyMatches)
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
