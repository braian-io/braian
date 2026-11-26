import { describe, expect, it, vi } from 'vitest'
import type { LayoutDoc } from './layout'
import { finishLayoutSave, noteLayoutEdit, rebaseLayout, saveVersionedLayout } from './layout-save'

function doc(partial: Partial<LayoutDoc>): LayoutDoc {
  return {
    id: 'ws',
    title: 'Products',
    layout: { type: 'tabs', views: ['products'], active: 0 },
    focus: 'products',
    ...partial,
  }
}

describe('rebaseLayout', () => {
  it('keeps a server layout when the user only changed focus', () => {
    const base = doc({ focus: 'products' })
    const local = doc({ focus: 'detail' })
    const server = doc({
      focus: 'products',
      layout: { type: 'tabs', views: ['products', 'graph'], active: 1 },
    })
    expect(rebaseLayout(base, local, server)).toEqual({
      ...server,
      focus: 'detail',
    })
  })

  it('keeps a server focus when the user only changed the layout', () => {
    const base = doc({})
    const local = doc({ layout: { type: 'tabs', views: ['products', 'agent'], active: 1 }, focus: 'products' })
    const server = doc({ focus: 'graph' })
    expect(rebaseLayout(base, local, server).layout).toEqual(local.layout)
    expect(rebaseLayout(base, local, server).focus).toBe('graph')
  })

  it('keeps both edits when the user changed layout and focus', () => {
    const base = doc({})
    const local = doc({
      layout: { type: 'tabs', views: ['agent'], active: 0 },
      focus: 'agent',
    })
    const server = doc({
      layout: { type: 'tabs', views: ['products', 'graph'], active: 0 },
      focus: 'graph',
      zoom: 'graph',
    })
    const merged = rebaseLayout(base, local, server)
    expect(merged.layout).toEqual(local.layout)
    expect(merged.focus).toBe('agent')
    expect(merged.zoom).toBe('graph')
  })

  it('uses the local document when the user started from an empty layout', () => {
    const local = doc({ focus: 'detail' })
    const server = doc({ focus: 'products' })
    expect(rebaseLayout(null, local, server)).toBe(local)
  })
})

describe('layout save gate', () => {
  it('coalesces edits that arrive while a save is in flight into one trailing save', () => {
    let gate = { inflight: true, trailing: false }
    gate = noteLayoutEdit(gate)
    gate = noteLayoutEdit(gate)
    gate = noteLayoutEdit(gate)
    expect(gate).toEqual({ inflight: true, trailing: true })
    expect(finishLayoutSave(gate)).toEqual({
      gate: { inflight: false, trailing: false },
      again: true,
    })
  })

  it('does not schedule a trailing save when nothing changed during the PUT', () => {
    expect(finishLayoutSave({ inflight: true, trailing: false }).again).toBe(false)
    expect(noteLayoutEdit({ inflight: false, trailing: false })).toEqual({ inflight: false, trailing: false })
  })
})

describe('saveVersionedLayout', () => {
  it('retries a stale write once with the user change rebased onto the server', async () => {
    const base = doc({ focus: 'products' })
    const local = doc({ focus: 'detail' })
    const server = doc({
      focus: 'products',
      layout: { type: 'tabs', views: ['products', 'graph'], active: 0 },
    })
    const put = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }))
      .mockResolvedValueOnce({ updated_at: '2026-11-26T08:00:00Z' })
    const refetch = vi.fn().mockResolvedValue({ document: server, updated_at: '2026-11-26T07:59:00Z' })
    const onConflict = vi.fn()
    const saved = await saveVersionedLayout({
      baseUpdatedAt: '2026-11-26T07:00:00Z',
      baseDocument: base,
      localDocument: local,
      latest: () => local,
      put,
      refetch,
      isConflict: (error) => error instanceof Error && (error as { status?: number }).status === 409,
      onConflict,
    })
    expect(onConflict).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[0]).toEqual([local, '2026-11-26T07:00:00Z'])
    expect(put.mock.calls[1][0]).toEqual({ ...server, focus: 'detail' })
    expect(put.mock.calls[1][1]).toBe('2026-11-26T07:59:00Z')
    expect(saved.updated_at).toBe('2026-11-26T08:00:00Z')
    expect(saved.document.focus).toBe('detail')
    expect(saved.document.layout).toEqual(server.layout)
  })

  it('does not retry a conflict a second time', async () => {
    const conflict = Object.assign(new Error('conflict'), { status: 409 })
    const put = vi.fn().mockRejectedValue(conflict)
    const refetch = vi.fn().mockResolvedValue({ document: doc({}), updated_at: '2026-11-26T07:59:00Z' })
    await expect(
      saveVersionedLayout({
        baseUpdatedAt: '2026-11-26T07:00:00Z',
        baseDocument: doc({}),
        localDocument: doc({ focus: 'detail' }),
        latest: () => doc({ focus: 'detail' }),
        put,
        refetch,
        isConflict: () => true,
      }),
    ).rejects.toBe(conflict)
    expect(put).toHaveBeenCalledTimes(2)
    expect(refetch).toHaveBeenCalledOnce()
  })
})
