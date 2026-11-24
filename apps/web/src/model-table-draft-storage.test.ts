// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearModelTableDraftsForWorkspace,
  parseModelTableDraftStorageKey,
  pruneModelTableDraftStorage,
} from './model-table-draft-storage'
import { writeStoredModelTableDraft } from './model-table-draft-persist'

describe('model table draft storage cleanup', () => {
  beforeEach(() => localStorage.clear())

  it('parses draft storage keys', () => {
    expect(parseModelTableDraftStorageKey('braian.model-table-draft.user.ws.product')).toEqual({
      userId: 'user',
      workspaceId: 'ws',
      selectionKey: 'product',
    })
  })

  it('drops drafts for removed workspaces and types on prune', () => {
    writeStoredModelTableDraft('user', 'gone', 'product', { v: 2, draftRows: {}, pendingDetach: [], pendingDelete: [] })
    writeStoredModelTableDraft('user', 'keep', 'missing', { v: 2, draftRows: {}, pendingDetach: [], pendingDelete: [] })
    writeStoredModelTableDraft('user', 'keep', 'product', { v: 2, draftRows: {}, pendingDetach: [], pendingDelete: [] })
    const removed = pruneModelTableDraftStorage('user', new Set(['keep']), {
      types: [{ key: 'product' }],
      structures: [],
    })
    expect(removed).toEqual(expect.arrayContaining([
      'braian.model-table-draft.user.gone.product',
      'braian.model-table-draft.user.keep.missing',
    ]))
    expect(localStorage.getItem('braian.model-table-draft.user.keep.product')).not.toBeNull()
  })

  it('clears all drafts for a deleted workspace', () => {
    writeStoredModelTableDraft('user', 'w1', 'product', { v: 2, draftRows: {}, pendingDetach: [], pendingDelete: [] })
    writeStoredModelTableDraft('user', 'w2', 'product', { v: 2, draftRows: {}, pendingDetach: [], pendingDelete: [] })
    clearModelTableDraftsForWorkspace('user', 'w1')
    expect(localStorage.getItem('braian.model-table-draft.user.w1.product')).toBeNull()
    expect(localStorage.getItem('braian.model-table-draft.user.w2.product')).not.toBeNull()
  })
})