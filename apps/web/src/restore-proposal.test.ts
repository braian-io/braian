import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { isRollbackProposal, restoreAcceptConflictMessage } from './restore-proposal'

describe('restore helpers', () => {
  it('detects rollback proposals by source', () => {
    expect(isRollbackProposal('rollback')).toBe(true)
    expect(isRollbackProposal('user')).toBe(false)
  })

  it('maps accept conflicts', () => {
    expect(restoreAcceptConflictMessage(new ApiError(409, 'busy', null))).toBe(
      'Someone else changed this. Reload to see the latest version.',
    )
    expect(restoreAcceptConflictMessage(new Error('nope'))).toBeNull()
  })
})