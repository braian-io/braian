// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  findPendingCreateRowId,
  INLINE_ROW_ORDER_KEY,
  isPendingCreateRow,
  removeDraftRow,
} from './inline-create'

type Row = { id: string; name: string }

describe('inline create helpers', () => {
  const persisted: Row[] = [{ id: '1', name: 'One' }]

  it('treats rows absent from persisted data as pending creates', () => {
    expect(isPendingCreateRow('new-abc', persisted)).toBe(true)
    expect(isPendingCreateRow('1', persisted)).toBe(false)
    expect(isPendingCreateRow(INLINE_ROW_ORDER_KEY, persisted)).toBe(false)
  })

  it('finds the pending create id in draft rows', () => {
    const drafts: Record<string, Row> = {
      '1': { id: '1', name: 'Changed' },
      'new-x': { id: 'new-x', name: '' },
    }
    Object.defineProperty(drafts, INLINE_ROW_ORDER_KEY, { value: ['1', 'new-x'], enumerable: false })
    expect(findPendingCreateRowId(drafts, persisted)).toBe('new-x')
  })

  it('removes a draft row and updates hidden row order', () => {
    const drafts: Record<string, Row> = {
      'new-x': { id: 'new-x', name: '' },
      '1': { id: '1', name: 'Changed' },
    }
    Object.defineProperty(drafts, INLINE_ROW_ORDER_KEY, { value: ['1', 'new-x'], enumerable: false })
    const next = removeDraftRow(drafts, 'new-x')
    expect(next['new-x']).toBeUndefined()
    expect((next as Record<string, unknown>)[INLINE_ROW_ORDER_KEY]).toEqual(['1'])
  })
})
