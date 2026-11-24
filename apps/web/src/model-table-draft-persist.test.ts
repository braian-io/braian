// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ROW_ORDER_KEY } from './standard-editable-table'
import {
  buildStoredAttributeRowPatch,
  clearStoredModelTableDraft,
  modelTableDraftStorageKey,
  readStoredModelTableDraft,
  serializeModelTableDraftForStorage,
  validateStoredModelTableDraft,
  writeStoredModelTableDraft,
  type StoredAttributeRowPatch,
  type StoredAttributeTableRow,
  type StoredModelTableDraft,
} from './model-table-draft-persist'

const defs = {
  types: [{ key: 'product', attributes: ['a1'] }],
  attributes: [
    {
      id: 'a1',
      key: 'brand',
      labels: { en: 'Brand' },
      kind: { type: 'text' },
      index: { searchable: false, filterable: false },
    },
    { id: 'a2', key: 'color', labels: { en: 'Color' }, kind: { type: 'text' } },
  ],
  structures: [],
  unit_families: [],
}

const selection = { kind: 'type' as const, typeKey: 'product' }

function serverRow(overrides: Partial<StoredAttributeTableRow> = {}): StoredAttributeTableRow {
  return {
    id: 'a1',
    key: 'brand',
    label: 'Brand',
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
    ...overrides,
  }
}

describe('model table draft persistence', () => {
  it('round-trips v2 create rows through localStorage', () => {
    const storage = window.localStorage
    const payload = serializeModelTableDraftForStorage({
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
      draftPatches: {},
      pendingDetach: [],
      pendingDelete: [],
      defs,
    })
    writeStoredModelTableDraft('user', 'ws', 'product', payload, storage)
    const read = readStoredModelTableDraft('user', 'ws', 'product', storage)
    expect(read?.v).toBe(2)
    expect((read?.draftRows.new_attr as StoredAttributeTableRow).key).toBe('new_attr')
    clearStoredModelTableDraft('user', 'ws', 'product', storage)
    expect(readStoredModelTableDraft('user', 'ws', 'product', storage)).toBeNull()
    expect(modelTableDraftStorageKey('u', 'w', 'k')).toBe('braian.model-table-draft.u.w.k')
  })

  it('stores changed fields only for persisted attributes', () => {
    const edited = serverRow({ searchable: true, label: 'Brand edited' })
    const stored = serializeModelTableDraftForStorage({
      draftRows: { a1: edited },
      draftPatches: {
        a1: {
          searchable: { base: false, value: true },
          label: { base: 'Brand', value: 'Brand edited' },
        },
      },
      pendingDetach: [],
      pendingDelete: [],
      defs,
    })
    expect(stored.v).toBe(2)
    const patch = stored.draftRows.a1
    expect(patch && typeof patch === 'object' && 'patch' in patch && (patch as { patch?: boolean }).patch).toBe(true)
    const rowPatch = patch as StoredAttributeRowPatch
    expect(rowPatch.changes.searchable).toEqual({ base: false, value: true })
    expect(rowPatch.changes.label).toEqual({ base: 'Brand', value: 'Brand edited' })
    expect(rowPatch.changes.filterable).toBeUndefined()
  })

  it('drops create rows when the key already exists on the server', () => {
    const stored: StoredModelTableDraft = {
      v: 2,
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

  it('restores patches when bases still match and drops conflicting fields', () => {
    const serverNow = {
      ...defs,
      attributes: [
        {
          id: 'a1',
          key: 'brand',
          labels: { en: 'Brand' },
          kind: { type: 'text' },
          index: { searchable: false, filterable: true },
        },
      ],
    }
    const stored = serializeModelTableDraftForStorage({
      draftRows: { a1: serverRow({ searchable: true, filterable: false }) },
      draftPatches: {
        a1: {
          searchable: { base: false, value: true },
          filterable: { base: false, value: false },
        },
      },
      pendingDetach: [],
      pendingDelete: [],
      defs,
    })
    const restored = validateStoredModelTableDraft(stored, serverNow, selection)
    expect(restored.draftRows.a1?.searchable).toBe(true)
    expect(restored.draftRows.a1?.filterable).toBe(true)
    expect(restored.draftPatches.a1?.searchable).toEqual({ base: false, value: true })
    expect(restored.draftPatches.a1?.filterable).toBeUndefined()
    expect(restored.droppedFields).toEqual([{ attributeKey: 'brand', field: 'filterable' }])
    expect(restored.trimmed).toBe(true)
  })

  it('keeps patches for persisted attributes and trims missing detach ids', () => {
    const stored: StoredModelTableDraft = {
      v: 2,
      draftRows: {
        a1: {
          patch: true,
          id: 'a1',
          key: 'brand',
          changes: { label: { base: 'Brand', value: 'Brand edited' }, searchable: { base: false, value: true } },
        },
        [ROW_ORDER_KEY]: ['missing', 'a1'],
      },
      pendingDetach: ['a1', 'missing'],
      pendingDelete: ['ghost'],
    }
    const restored = validateStoredModelTableDraft(stored, defs, selection)
    expect(restored.draftRows.a1?.label).toBe('Brand edited')
    expect(restored.draftRows.a1?.searchable).toBe(true)
    expect(restored.pendingDetach).toEqual(['a1'])
    expect(restored.pendingDelete).toEqual([])
    expect(restored.trimmed).toBe(true)
  })

  it('buildStoredAttributeRowPatch returns null when nothing changed', () => {
    const row = serverRow()
    expect(buildStoredAttributeRowPatch(row, row)).toBeNull()
  })
})