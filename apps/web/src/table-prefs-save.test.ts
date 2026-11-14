import { describe, expect, it, vi } from 'vitest'
import {
  createTablePrefsSaver,
  tablePrefsBody,
  type TablePrefsBody,
  type TablePrefsSnapshot,
} from './table-prefs-save'

function snapshot(source: string): TablePrefsSnapshot {
  return {
    view: {
      id: 'view-1',
      type: 'object_table',
      title: 'Articles',
      pane: 'center',
      position: 0,
      state: {
        object_type: 'article',
        source: { kind: 'peer', viewId: source, selection: 'row' },
      },
    },
    workspaceId: 'workspace-1',
    table: { filter: '', sort: 'a_number:asc', groupBy: '', sizes: {} },
  }
}

function sourceOf(body: TablePrefsBody) {
  return (body.state as { source?: { viewId?: string } }).source?.viewId ?? ''
}

type Held = {
  body: TablePrefsBody
  signal: AbortSignal
  resolve: () => void
}

function heldPost() {
  const calls: Held[] = []
  const writes: string[] = []
  const post = vi.fn(
    (body: TablePrefsBody, signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        calls.push({
          body,
          signal,
          resolve: () => {
            writes.push(sourceOf(body))
            resolve()
          },
        })
        signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      }),
  )
  return { calls, writes, post }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('tablePrefsBody', () => {
  it('keeps the view source in the full state it sends', () => {
    const body = tablePrefsBody(snapshot('products'))
    expect(sourceOf(body)).toBe('products')
    expect(body.state).toMatchObject({ object_type: 'article' })
  })
})

describe('createTablePrefsSaver', () => {
  it('does not let a slow in-flight save with an old source remain the last write', async () => {
    const { calls, writes, post } = heldPost()
    const errors: unknown[] = []
    const saver = createTablePrefsSaver(post, { delayMs: 1_000, onError: (reason) => errors.push(reason) })
    let current = snapshot('food')

    saver.schedule(() => current)
    saver.flush()
    expect(calls.map((call) => sourceOf(call.body))).toEqual(['food'])

    current = snapshot('products')
    saver.schedule(() => current)
    calls[0].resolve()
    await tick()

    expect(calls.map((call) => sourceOf(call.body))).toEqual(['food', 'products'])
    calls[1].resolve()
    await tick()

    expect(writes).toEqual(['food', 'products'])
    expect(errors).toEqual([])
  })

  it('aborts the stale POST when the effect reruns and saves the new source', async () => {
    const { calls, writes, post } = heldPost()
    const errors: unknown[] = []
    const saver = createTablePrefsSaver(post, { delayMs: 1_000, onError: (reason) => errors.push(reason) })
    let current = snapshot('food')

    saver.schedule(() => current)
    saver.flush()
    expect(calls).toHaveLength(1)

    saver.cancel()
    expect(calls[0].signal.aborted).toBe(true)
    await tick()

    current = snapshot('products')
    saver.schedule(() => current)
    saver.flush()
    expect(calls.map((call) => sourceOf(call.body))).toEqual(['food', 'products'])

    calls[1].resolve()
    await tick()

    expect(writes).toEqual(['products'])
    expect(errors).toEqual([])
  })
})
