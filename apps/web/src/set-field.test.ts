import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type Json } from './api'
import { copy } from './i18n'
import {
  commitSetField,
  emptySetFieldDraft,
  loadSetFieldTargets,
  setFieldChoices,
  setFieldConfirmMessage,
  setFieldFailureMessage,
  setFieldGroups,
  setFieldNeedsConfirm,
  setFieldNextValue,
  setFieldNoun,
  setFieldValueError,
  setFieldValues,
  versionsFromRows,
  writeSetField,
  type SetFieldChoice,
} from './set-field'

const mock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock }
})

const defs: Json = {
  attributes: [
    { id: 'number', key: 'number', labels: { en: 'Number' }, kind: { type: 'text' } },
    { id: 'name', key: 'name', labels: { en: 'Name' }, language_dependent: true, required: true, kind: { type: 'text', max_length: 80 } },
    { id: 'brand', key: 'brand', labels: { en: 'Brand' }, kind: { type: 'text', max_length: 80 } },
    { id: 'status', key: 'status', labels: { en: 'Status' }, kind: { type: 'value_list', list: 'status' } },
    { id: 'days', key: 'lead_time_days', labels: { en: 'Lead time' }, kind: { type: 'number', integer: true } },
    { id: 'weight', key: 'net_weight', labels: { en: 'Net weight' }, kind: { type: 'number', unit_family: 'mass' } },
    { id: 'image', key: 'image', labels: { en: 'Image' }, kind: { type: 'file_ref' } },
    { id: 'fat', key: 'fat_content', labels: { en: 'Fat content' }, kind: { type: 'number' } },
  ],
  value_lists: [{
    key: 'status',
    options: [
      { code: 'draft', labels: { en: 'Draft' } },
      { code: 'ok', labels: { en: 'OK' } },
    ],
  }],
  unit_families: [{
    id: 'mass',
    key: 'mass',
    base_unit: 'g',
    units: [{ code: 'g' }, { code: 'kg' }],
  }],
  types: [{
    key: 'product',
    key_attribute: 'number',
    plural: { en: 'Products' },
    attributes: ['number', 'name', 'brand', 'status', 'days', 'weight', 'image'],
  }],
  structures: [{
    key: 'food',
    groups: [
      { id: 'dairy', key: 'dairy', attributes: ['fat'] },
      { id: 'milk', key: 'milk', parent: 'dairy', attributes: [] },
    ],
  }],
}

function choice(key: string): SetFieldChoice {
  const found = setFieldChoices(defs, 'product').find((item) => item.key === key)
  if (!found) throw new Error(`missing ${key}`)
  return found
}

beforeEach(() => {
  mock.get.mockReset()
  mock.post.mockReset()
  mock.put.mockReset()
  mock.patch.mockReset()
  mock.delete.mockReset()
})

describe('set field plan', () => {
  it('lists fields that apply to the type and skips the key and file refs', () => {
    expect(setFieldChoices(defs, 'product').map((item) => item.key)).toEqual([
      'name',
      'brand',
      'status',
      'lead_time_days',
      'net_weight',
    ])
    expect(setFieldChoices(defs, 'product', 'en', setFieldGroups('food:milk')).map((item) => item.key)).toContain('fat_content')
    expect(setFieldGroups('food')).toEqual([])
  })

  it('asks for a count confirm only when more than one row is selected', () => {
    expect(setFieldNeedsConfirm(1)).toBe(false)
    expect(setFieldNeedsConfirm(12)).toBe(true)
    expect(setFieldNoun('Products')).toBe('products')
    expect(setFieldConfirmMessage('Status', 12, 'products')).toBe('Set Status on 12 products?')
  })

  it('builds the same patch shape as a cell or Detail save', () => {
    const name = choice('name')
    expect(setFieldValues('name', setFieldNextValue(name, { ...emptySetFieldDraft(name), text: 'Oat' }, 'en'))).toEqual({
      name: { en: 'Oat' },
    })
    const weight = choice('net_weight')
    expect(setFieldNextValue(weight, { ...emptySetFieldDraft(weight), text: '1,5', unit: 'kg' }, 'en')).toEqual({
      value: '1.5',
      unit: 'kg',
    })
    const status = choice('status')
    expect(setFieldValues('status', setFieldNextValue(status, { ...emptySetFieldDraft(status), text: 'ok' }, 'en'))).toEqual({
      status: 'ok',
    })
  })

  it('rejects a bad value and does not describe it as writable', () => {
    const days = choice('lead_time_days')
    expect(setFieldValueError(days, setFieldNextValue(days, { ...emptySetFieldDraft(days), text: 'nope' }, 'en'))).toBe(copy.fieldInvalidNumber)
    expect(setFieldValueError(days, setFieldNextValue(days, { ...emptySetFieldDraft(days), text: '1.5' }, 'en'))).toBe(copy.fieldWholeNumber)
    const brand = choice('brand')
    expect(setFieldValueError(brand, 'x'.repeat(81))).toBe(copy.fieldTooLong.replaceAll('{max}', '80'))
    const status = choice('status')
    expect(setFieldValueError(status, '')).toBe(copy.fieldChoice)
    expect(setFieldValueError(status, 'ok')).toBe('')
  })

  it('keeps known versions and reports a row that cannot be loaded', async () => {
    const known = versionsFromRows([
      { id: 'a', version: '4' },
      { id: 'b', version: '' },
    ])
    const loaded = await loadSetFieldTargets(['a', 'b', 'c'], known, async (id) => {
      if (id === 'c') throw new Error('missing')
      return 2
    })
    expect(loaded.targets).toEqual([{ id: 'a', version: 4 }, { id: 'b', version: 2 }])
    expect(loaded.failed).toEqual([{ id: 'c', message: 'missing' }])
  })
})

describe('set field write', () => {
  it('patches each object and keeps going when one write fails', async () => {
    const patch = vi.fn(async (target: { id: string }) => {
      if (target.id === 'b') throw new ApiError(409, 'version conflict', { detail: 'version conflict' })
      return { id: target.id, version: 5 }
    })
    const result = await writeSetField({
      targets: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }, { id: 'c', version: 2 }],
      values: { brand: 'Nordic' },
      patch,
    })
    expect(patch).toHaveBeenCalledTimes(3)
    expect(result.applied).toEqual(['a', 'c'])
    expect(result.failed).toEqual([{ id: 'b', message: 'version conflict' }])
    expect(setFieldFailureMessage(result.failed, result.applied.length)).toBe('2 updated. 1 could not be updated. version conflict')
  })

  it('writes with object patches and does not create a proposal', async () => {
    mock.patch.mockImplementation(async (_path: string, init: { params: { path: { id: string } } }) => ({
      id: init.params.path.id,
      version: 3,
      values: { brand: 'Nordic' },
    }))
    const saved: string[] = []
    const result = await commitSetField({
      targets: [{ id: 'a', version: 2 }, { id: 'b', version: 4 }],
      values: { brand: 'Nordic' },
      onSaved: async (_body, id) => { saved.push(id) },
    })
    expect(result).toEqual({ applied: ['a', 'b'], failed: [] })
    expect(saved).toEqual(['a', 'b'])
    expect(mock.post).not.toHaveBeenCalled()
    expect(mock.patch).toHaveBeenNthCalledWith(1, '/v1/objects/{id}', {
      params: { path: { id: 'a' }, header: { 'If-Match': 2 } },
      body: { values: { brand: 'Nordic' } },
    })
    expect(mock.patch).toHaveBeenNthCalledWith(2, '/v1/objects/{id}', {
      params: { path: { id: 'b' }, header: { 'If-Match': 4 } },
      body: { values: { brand: 'Nordic' } },
    })
    const paths = mock.patch.mock.calls.map((call) => String(call[0]))
    expect(paths.every((path) => path === '/v1/objects/{id}')).toBe(true)
    expect(paths.some((path) => path.includes('mass_edit') || path.includes('/v1/bulk'))).toBe(false)
  })
})
