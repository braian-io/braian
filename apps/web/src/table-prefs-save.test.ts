import { describe, expect, it, vi } from 'vitest'
import { savedTable } from './panes'
import {
  createTablePrefsSaver,
  tablePrefsBody,
  type TablePrefsBody,
  type TablePrefsSnapshot,
} from './table-prefs-save'

function snapshot(sort: string): TablePrefsSnapshot {
  return {
    view: {
      id: 'view-1',
      type: 'object_table',
      title: 'Articles',
      pane: 'center',
      position: 0,
      state: {
        object_type: 'article',
        source: { kind: 'peer', viewId: 'products', selection: 'row' },
      },
    },
    workspaceId: 'workspace-1',
    table: { sort, groupBy: '', sizes: {} },
    updatedAt: '2026-11-26T07:00:00Z',
  }
}

function sortOf(body: TablePrefsBody) {
  return (body.state as { table?: { sort?: string } }).table?.sort ?? ''
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
            writes.push(sortOf(body))
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
  it('sends only the table key and the version the edit was based on', () => {
    const body = tablePrefsBody(snapshot('a_number:asc'))
    expect(body.state).toEqual({
      table: { filter: '', sort: 'a_number:asc', groupBy: '', sizes: {} },
    })
    expect(body.expected_updated_at).toBe('2026-11-26T07:00:00Z')
  })

  it('writes an empty filter so a previously saved query cannot come back', () => {
    const current = snapshot('a_name__en:desc')
    current.view.state = {
      ...(current.view.state as Record<string, unknown>),
      table: {
        filter: 'DEMO208-6517112',
        sort: 'a_name__en:desc',
        groupBy: 'a_status',
        sizes: { name: 320 },
      },
    }
    current.table = { sort: 'a_name__en:desc', groupBy: 'a_status', sizes: { name: 320 } }

    expect(tablePrefsBody(current).state).toMatchObject({
      table: { filter: '', sort: 'a_name__en:desc', groupBy: 'a_status', sizes: { name: 320 } },
    })
  })
})

describe('savedTable', () => {
  it('starts the free-text search empty even when the view row has a saved query', () => {
    const initial = savedTable({
      id: 'view-1',
      type: 'object_table',
      title: 'Products',
      state: {
        table: {
          filter: 'DEMO208-6517112',
          sort: 'a_name__en:desc',
          groupBy: 'a_status',
          sizes: { name: 320 },
        },
      },
    })

    expect(initial.filter).toBe('')
    expect(initial.sort).toBe('a_name__en:desc')
    expect(initial.groupBy).toBe('a_status')
    expect(initial.sizes).toEqual({ name: 320 })
  })

  it('coerces a malformed bare column sort to the number default', () => {
    const initial = savedTable({
      id: 'view-1',
      type: 'object_table',
      title: 'Products',
      state: { table: { sort: 'number', groupBy: '', sizes: {} } },
    })
    expect(initial.sort).toBe('a_number:asc')
    expect(initial.groupBy).toBe('')
  })
})

describe('createTablePrefsSaver', () => {
  it('does not let a slow in-flight save with an old sort remain the last write', async () => {
    const { calls, writes, post } = heldPost()
    const errors: unknown[] = []
    const saver = createTablePrefsSaver(post, { delayMs: 1_000, onError: (reason) => errors.push(reason) })
    let current = snapshot('a_number:asc')

    saver.schedule(() => current)
    saver.flush()
    expect(calls.map((call) => sortOf(call.body))).toEqual(['a_number:asc'])

    current = snapshot('a_name__en:desc')
    saver.schedule(() => current)
    calls[0].resolve()
    await tick()

    expect(calls.map((call) => sortOf(call.body))).toEqual(['a_number:asc', 'a_name__en:desc'])
    calls[1].resolve()
    await tick()

    expect(writes).toEqual(['a_number:asc', 'a_name__en:desc'])
    expect(errors).toEqual([])
  })

  it('aborts the stale POST when the effect reruns and saves the new sort', async () => {
    const { calls, writes, post } = heldPost()
    const errors: unknown[] = []
    const saver = createTablePrefsSaver(post, { delayMs: 1_000, onError: (reason) => errors.push(reason) })
    let current = snapshot('a_number:asc')

    saver.schedule(() => current)
    saver.flush()
    expect(calls).toHaveLength(1)

    saver.cancel()
    expect(calls[0].signal.aborted).toBe(true)
    await tick()

    current = snapshot('a_name__en:desc')
    saver.schedule(() => current)
    saver.flush()
    expect(calls.map((call) => sortOf(call.body))).toEqual(['a_number:asc', 'a_name__en:desc'])

    calls[1].resolve()
    await tick()

    expect(writes).toEqual(['a_name__en:desc'])
    expect(errors).toEqual([])
  })
})
