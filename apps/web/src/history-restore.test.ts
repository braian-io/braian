import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { historyRestoreErrorMessage, rollbackDiffLines } from './history-restore'

describe('rollbackDiffLines', () => {
  it('maps proposal rows to suggestion lines', () => {
    const lines = rollbackDiffLines({
      rows: [{
        object_id: 'obj-1',
        base_values: { number: 'after' },
        patch: { values: { number: 'before' } },
      }],
    }, {
      attributes: [{ key: 'number', labels: { en: 'Number' } }],
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]?.before).toBe('after')
    expect(lines[0]?.after).toBe('before')
  })
})

describe('historyRestoreErrorMessage', () => {
  it('explains conflicts', () => {
    expect(historyRestoreErrorMessage(new ApiError(409, 'x', null))).toContain('Someone else changed')
    expect(historyRestoreErrorMessage(new Error('nope'))).toBe('nope')
  })
})