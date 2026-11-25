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
    defaultUnit: '',
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
    integer: false,
    maxLength: '',
    textForm: '',
    media: false,
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
          defaultUnit: '',
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
          integer: false,
          maxLength: '',
          textForm: '',
          media: false,
        },
      },
      draftPatches: {},
      pendingDetach: [],
      pendingDelete: [],
      defs,
    })
    writeStoredModelTableDraft('user', 'ws', 'product', payload, storage)
    expect(readStoredModelTableDraft('user', 'ws', 'product', storage)).toEqual(payload)
    clearStoredModelTableDraft('user', 'ws', 'product', storage)
    expect(readStoredModelTableDraft('user', 'ws', 'product', storage)).toBeNull()
    expect(modelTableDraftStorageKey('u', 'w', 'k')).toBe('braian.model-table-draft.u.w.k')
  })

  it('reads v1 full-row snapshots and re-serializes them as v2 field patches', () => {
    const storage = window.localStorage
    const createRow: StoredAttributeTableRow = {
      id: 'new_attr',
      key: 'new_attr',
      label: 'New',
      kind: 'text',
      unit: '',
    defaultUnit: '',
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
      integer: false,
      maxLength: '',
      textForm: '',
      media: false,
    }
    const v1: StoredModelTableDraft = {
      v: 1,
      draftRows: {
        a1: serverRow({ label: 'Brand edited', searchable: true }),
        new_attr: createRow,
      },
      pendingDetach: [],
      pendingDelete: [],
    }
    writeStoredModelTableDraft('user', 'ws', 'product', v1, storage)
    expect(readStoredModelTableDraft('user', 'ws', 'product', storage)).toEqual(v1)

    const restored = validateStoredModelTableDraft(v1, defs, selection)
    expect(restored.draftRows.a1).toMatchObject({ label: 'Brand edited', searchable: true })
    expect(restored.draftPatches.a1?.searchable).toEqual({ base: false, value: true })
    expect(restored.draftPatches.a1?.label).toEqual({ base: 'Brand', value: 'Brand edited' })
    expect(restored.draftRows.new_attr).toEqual(createRow)

    const v2 = serializeModelTableDraftForStorage({
      draftRows: restored.draftRows,
      draftPatches: restored.draftPatches,
      pendingDetach: restored.pendingDetach,
      pendingDelete: restored.pendingDelete,
      defs,
    })
    expect(v2).toEqual({
      v: 2,
      draftRows: {
        a1: {
          patch: true,
          id: 'a1',
          key: 'brand',
          changes: {
            label: { base: 'Brand', value: 'Brand edited' },
            searchable: { base: false, value: true },
          },
        },
        new_attr: createRow,
      },
      pendingDetach: [],
      pendingDelete: [],
    })
    clearStoredModelTableDraft('user', 'ws', 'product', storage)
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
          defaultUnit: '',
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
          integer: false,
          maxLength: '',
          textForm: '',
          media: false,
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
  })

  it('restores patches for new rule fields', () => {
    const stored: StoredModelTableDraft = {
      v: 2,
      draftRows: {
        a1: buildStoredAttributeRowPatch(serverRow(), serverRow({ maxLength: '40', integer: false }))!,
      },
      pendingDetach: [],
      pendingDelete: [],
    }
    const restored = validateStoredModelTableDraft(stored, defs, selection)
    expect(restored.draftPatches.a1?.maxLength).toEqual({ base: '', value: '40' })
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