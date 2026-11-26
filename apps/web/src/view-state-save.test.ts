import { describe, expect, it, vi } from 'vitest'
import {
  applyViewPatch,
  createViewKeySaver,
  rebaseViewState,
  saveVersionedViewKeys,
  saveViewChange,
  viewStatePatch,
  type ViewKeyTarget,
  type ViewPostBody,
  type ViewState,
} from './view-state-save'

const base = { object_type: 'article', catalogOverride: { catalogId: 'master' }, table: { sort: 'a_number:asc' } }

describe('viewStatePatch', () => {
  it('keeps only keys the user changed and marks a removed key as null', () => {
    const local = { object_type: 'article', table: { sort: 'a_name:desc' } }
    expect(viewStatePatch(base, local)).toEqual({
      catalogOverride: null,
      table: { sort: 'a_name:desc' },
    })
  })

  it('uses the local document when the user started from an empty view', () => {
    expect(viewStatePatch(null, { catalogOverride: { catalogId: 'sap' } })).toEqual({
      catalogOverride: { catalogId: 'sap' },
    })
  })
})

describe('rebaseViewState', () => {
  it('keeps a server table when the user only changed the catalog', () => {
    const local = { ...base, catalogOverride: { catalogId: 'sap' } }
    const server = { ...base, table: { sort: 'a_name:desc', filter: '' } }
    expect(rebaseViewState(base, local, server)).toEqual({
      ...server,
      catalogOverride: { catalogId: 'sap' },
    })
  })

  it('applies a removed key onto the server document', () => {
    const local = { object_type: 'article', table: base.table }
    const server = { ...base, table: { sort: 'a_name:desc' } }
    expect(rebaseViewState(base, local, server)).toEqual({
      object_type: 'article',
      table: { sort: 'a_name:desc' },
    })
    expect(applyViewPatch(server, { catalogOverride: null }).catalogOverride).toBeUndefined()
  })
})

describe('saveVersionedViewKeys', () => {
  it('retries a stale write once with the pending keys on the fresh version', async () => {
    const pending = { catalogOverride: { catalogId: 'sap' } }
    const post = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
      .mockResolvedValueOnce({ updated_at: '2026-11-26T08:00:00Z' })
    const refetch = vi.fn().mockResolvedValue({
      state: { ...base, table: { sort: 'a_name:desc' } },
      updated_at: '2026-11-26T07:59:00Z',
    })
    const onConflict = vi.fn()
    const saved = await saveVersionedViewKeys({
      baseUpdatedAt: '2026-11-26T07:00:00Z',
      pending,
      latestPending: () => pending,
      post,
      refetch,
      isConflict: (error) => error instanceof Error && (error as { status?: number }).status === 409,
      onConflict,
    })
    expect(onConflict).toHaveBeenCalledOnce()
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[0]).toEqual([pending, '2026-11-26T07:00:00Z'])
    expect(post.mock.calls[1]).toEqual([pending, '2026-11-26T07:59:00Z'])
    expect(saved.updated_at).toBe('2026-11-26T08:00:00Z')
    expect(saved.pending).toEqual(pending)
  })

  it('does not retry a conflict a second time', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const post = vi.fn().mockRejectedValue(conflict)
    const refetch = vi.fn().mockResolvedValue({ state: base, updated_at: '2026-11-26T07:59:00Z' })
    await expect(
      saveVersionedViewKeys({
        baseUpdatedAt: '2026-11-26T07:00:00Z',
        pending: { catalogOverride: { catalogId: 'sap' } },
        latestPending: () => ({ catalogOverride: { catalogId: 'sap' } }),
        post,
        refetch,
        isConflict: () => true,
      }),
    ).rejects.toBe(conflict)
    expect(post).toHaveBeenCalledTimes(2)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('sends the keys that changed and rebases them onto the server after a conflict', async () => {
    const next = { ...base, catalogOverride: { catalogId: 'sap' } }
    const post = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
      .mockResolvedValueOnce({ updated_at: '2026-11-26T08:00:00Z' })
    const server = { ...base, table: { sort: 'a_name:desc' } }
    const saved = await saveViewChange({
      id: 'view-1',
      workspaceId: 'workspace-1',
      type: 'object_table',
      title: 'Products',
      pane: 'center',
      position: 0,
      baseState: base,
      nextState: next,
      updatedAt: '2026-11-26T07:00:00Z',
      post: (body) => post(body.state, body.expected_updated_at),
      refetch: async () => ({ state: server, updated_at: '2026-11-26T07:59:00Z' }),
      isConflict: () => true,
    })
    expect(post.mock.calls[0][0]).toEqual({ catalogOverride: { catalogId: 'sap' } })
    expect(post.mock.calls[1][0]).toEqual({ catalogOverride: { catalogId: 'sap' } })
    expect(post.mock.calls[1][1]).toBe('2026-11-26T07:59:00Z')
    expect(saved.state.catalogOverride).toEqual({ catalogId: 'sap' })
    expect(saved.state.table).toEqual(base.table)
    expect(saved.updated_at).toBe('2026-11-26T08:00:00Z')
  })
})

describe('createViewKeySaver', () => {
  const view: ViewKeyTarget = {
    id: 'view-1',
    workspaceId: 'workspace-1',
    type: 'object_table',
    title: 'Products',
    updatedAt: '2026-11-26T07:00:00Z',
  }

  function heldPost() {
    const bodies: ViewPostBody[] = []
    let release: (() => void) | null = null
    const post = vi.fn((body: ViewPostBody) => {
      bodies.push(body)
      return new Promise<{ updated_at: string }>((resolve) => {
        release = () => resolve({ updated_at: `t-${bodies.length}` })
      })
    })
    return {
      bodies,
      post,
      settle: () => {
        const done = release
        release = null
        done?.()
      },
    }
  }

  it('sends only the latest value of each key from a rapid burst', async () => {
    const posts: ViewState[] = []
    const saver = createViewKeySaver({
      delayMs: 1_000,
      post: async (body) => {
        posts.push(body.state)
        return { updated_at: '2026-11-26T08:00:00Z' }
      },
      refetch: async () => ({ state: {}, updated_at: null }),
      isConflict: () => false,
    })
    saver.schedule(view, { catalogOverride: { catalogId: 'a' }, table: { sort: 'old' } })
    saver.schedule(view, { catalogOverride: { catalogId: 'b' } })
    saver.schedule(view, { catalogOverride: { catalogId: 'c' } })
    saver.flush()
    await vi.waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      catalogOverride: { catalogId: 'c' },
      table: { sort: 'old' },
    })
    expect(posts).toHaveLength(1)
  })

  it('sends the latest keys once after the in-flight save finishes', async () => {
    const held = heldPost()
    const saver = createViewKeySaver({
      delayMs: 1_000,
      post: held.post,
      refetch: async () => ({ state: base, updated_at: '2026-11-26T07:59:00Z' }),
      isConflict: () => false,
    })
    saver.schedule(view, { catalogOverride: { catalogId: 'sap' } })
    saver.flush()
    await vi.waitFor(() => expect(held.bodies).toHaveLength(1))
    saver.schedule(view, { catalogOverride: { catalogId: 'master' } })
    expect(held.bodies).toHaveLength(1)
    held.settle()
    await vi.waitFor(() => expect(held.bodies).toHaveLength(2))
    expect(held.bodies[1]?.state).toEqual({ catalogOverride: { catalogId: 'master' } })
    expect(held.bodies[1]?.expected_updated_at).toBe('t-1')
  })
})
