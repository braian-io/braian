import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import {
  applyObjectWrite,
  currentSearchWaitSeq,
  reconcileObjectWrite,
  recordObjectWrite,
  resetObjectWriteState,
} from './object-write'

beforeEach(() => {
  resetObjectWriteState()
})

describe('reconcileObjectWrite', () => {
  it('keeps a newer write when a stale read arrives', () => {
    const stale: Json = { id: 'obj-1', version: 3, values: { name: { en: 'Old' } } }
    const written: Json = { id: 'obj-1', version: 4, values: { name: { en: 'New' } } }

    recordObjectWrite(written)

    expect(reconcileObjectWrite('obj-1', stale)).toBe(written)
    expect(reconcileObjectWrite('obj-1', written)).toBe(written)
    expect(reconcileObjectWrite('obj-1', stale)).toBe(stale)
  })
})

describe('applyObjectWrite', () => {
  it('cancels in-flight reads before painting and waits for the indexed seq', async () => {
    const client = new QueryClient()
    const calls: string[] = []
    vi.spyOn(client, 'cancelQueries').mockImplementation(async (filters) => {
      calls.push(`cancel:${JSON.stringify(filters?.queryKey)}`)
      return undefined
    })
    vi.spyOn(client, 'setQueryData').mockImplementation((key) => {
      calls.push(`set:${JSON.stringify(key)}`)
      return undefined
    })
    vi.spyOn(client, 'invalidateQueries').mockImplementation(async (filters) => {
      calls.push(`invalidate:${JSON.stringify(filters?.queryKey)}`)
      return undefined
    })

    await applyObjectWrite(client, { id: 'obj-1', version: 4, seq: 9 })

    expect(calls.indexOf('cancel:["object","obj-1"]')).toBeLessThan(
      calls.indexOf('set:["object","obj-1"]'),
    )
    expect(calls).toContain('invalidate:["objects"]')
    expect(calls).toContain('invalidate:["path-values"]')
    expect(currentSearchWaitSeq()).toBe(9)
  })
})
