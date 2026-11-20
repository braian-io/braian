import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { copy } from './i18n'
import {
  discardRestoreOnDismiss,
  isRollbackProposal,
  objectDisplayLabel,
  restoreDiscardFailure,
  restoreTitle,
  rollbackTargetSeqFromPatch,
  versionAtSeq,
} from './restore-proposal'

describe('restore proposal helpers', () => {
  it('detects rollback proposals by source', () => {
    expect(isRollbackProposal('rollback')).toBe(true)
    expect(isRollbackProposal('user')).toBe(false)
  })

  it('reads the target seq from the patch metadata', () => {
    expect(rollbackTargetSeqFromPatch({ values: {}, _rollback_seq: 3 })).toBe(3)
    expect(rollbackTargetSeqFromPatch({ values: {} })).toBeUndefined()
  })

  it('builds a restore title with name, number and target version', () => {
    expect(objectDisplayLabel({ name: { en: 'Cola' }, number: '430' }, 'key-1')).toBe('Cola 430')
    expect(restoreTitle('Cola 430', 3)).toBe('Restore Cola 430 to version 3?')
    expect(restoreTitle('', 3)).toBe('Restore Objects to version 3?')
  })

  it('finds the object version at a history seq', () => {
    const changes = [{ seq: 1, version: 1 }, { seq: 2, version: 2 }]
    expect(versionAtSeq(changes, 2)).toBe(2)
    expect(versionAtSeq(changes, 9)).toBeUndefined()
  })

  it('auto-discards only when History passed rollbackSeq', () => {
    expect(discardRestoreOnDismiss(2)).toBe(true)
    expect(discardRestoreOnDismiss(undefined)).toBe(false)
  })

  it('closes quietly on missing rollback proposals and explains conflicts', () => {
    expect(restoreDiscardFailure(new ApiError(404, 'missing', null))).toEqual({ close: true, message: null })
    expect(restoreDiscardFailure(new ApiError(409, 'busy', null))).toEqual({
      close: false,
      message: copy.restoreConflict,
    })
    expect(restoreDiscardFailure(new ApiError(500, 'fail', null))).toEqual({
      close: false,
      message: copy.saveFailed,
    })
    expect(restoreDiscardFailure(new Error('nope'))).toEqual({ close: false, message: 'nope' })
  })
})