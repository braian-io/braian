// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ROW_ORDER_KEY } from './standard-editable-table'
import {
  clearStoredModelTableDraft,
  modelTableDraftStorageKey,
  readStoredModelTableDraft,
  validateStoredModelTableDraft,
  writeStoredModelTableDraft,
  type StoredModelTableDraft,
} from './model-table-draft-persist'

const defs = {
  types: [{ key: 'product', attributes: ['a1'] }],
  attributes: [
    { id: 'a1', key: 'brand', labels: { en: 'Brand' }, kind: { type: 'text' } },
    { id: 'a2', key: 'color', labels: { en: 'Color' }, kind: { type: 'text' } },
  ],
  structures: [],
}

const selection = { kind: 'type' as const, typeKey: 'product' }

describe('model table draft persistence', () => {
  it('round-trips through localStorage', () => {
    const storage = window.localStorage
    const payload: StoredModelTableDraft = {
      v: 1,
      draftRows: {
        new_attr: {
          id: 'new_attr',
          key: 'new_attr',
          label: 'New',
          kind: 'text',
          unit: '',
          required: false,
          showByDefault: true,
          languages: false,
          searchable: false,
          filterable: false,
          sortable: false,
          inherited: false,
          standard: false,
          multiple: false,
          min: '',
          max: '',
          valueList: '',
        },
      },
      pendingDetach: [],
      pendingDelete: [],
    }
    writeStoredModelTableDraft('user', 'ws', 'product', payload, storage)
    expect(readStoredModelTableDraft('user', 'ws', 'product', storage)).toEqual(payload)
    clearStoredModelTableDraft('user', 'ws', 'product', storage)
    expect(readStoredModelTableDraft('user', 'ws', 'product', storage)).toBeNull()
    expect(modelTableDraftStorageKey('u', 'w', 'k')).toBe('braian.model-table-draft.u.w.k')
  })

  it('drops create rows when the key already exists on the server', () => {
    const stored: StoredModelTableDraft = {
      v: 1,
      draftRows: {
        brand: {
          id: 'brand',
          key: 'brand',
          label: 'Dup',
          kind: 'text',
          unit: '',
          required: false,
          showByDefault: true,
          languages: false,
          searchable: false,
          filterable: false,
          sortable: false,
          inherited: false,
          standard: false,
          multiple: false,
          min: '',
          max: '',
          valueList: '',
        },
      },
      pendingDetach: [],
      pendingDelete: [],
    }
    const restored = validateStoredModelTableDraft(stored, defs, selection)
    expect(restored.draftRows).toEqual({})
    expect(restored.trimmed).toBe(true)
  })

  it('keeps patches for persisted attributes and trims missing detach ids', () => {
    const stored: StoredModelTableDraft = {
      v: 1,
      draftRows: {
        a1: {
          id: 'a1',
          key: 'brand',
          label: 'Brand edited',
          kind: 'text',
          unit: '',
          required: false,
          showByDefault: true,
          languages: false,
          searchable: true,
          filterable: false,
          sortable: false,
          inherited: false,
          standard: false,
          multiple: false,
          min: '',
          max: '',
          valueList: '',
        },
        [ROW_ORDER_KEY]: ['missing', 'a1'],
      },
      pendingDetach: ['a1', 'missing'],
      pendingDelete: ['ghost'],
    }
    const restored = validateStoredModelTableDraft(stored, defs, selection)
    expect(restored.draftRows.a1?.label).toBe('Brand edited')
    expect(restored.pendingDetach).toEqual(['a1'])
    expect(restored.pendingDelete).toEqual([])
    expect(restored.trimmed).toBe(true)
  })
})