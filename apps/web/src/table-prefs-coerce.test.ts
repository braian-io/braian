import { describe, expect, it } from 'vitest'
import { coerceTableGroupBy, coerceTableSort, DEFAULT_TABLE_SORT } from './table-prefs-coerce'

const defs = {
  attributes: [
    { id: '11111111-1111-7111-8111-111111111101', key: 'name', language_dependent: true, index: { searchable: true, filterable: true, sortable: true } },
    { id: '11111111-1111-7111-8111-111111111102', key: 'status', index: { searchable: true, filterable: true, sortable: true } },
  ],
}

describe('coerceTableSort', () => {
  it('maps a bare column id to the default number sort', () => {
    expect(coerceTableSort('number', defs)).toBe(DEFAULT_TABLE_SORT)
  })

  it('keeps a valid asc token and falls back on garbage', () => {
    expect(coerceTableSort('a_number:asc', defs)).toBe('a_number:asc')
    expect(coerceTableSort('totally-unknown:desc', defs)).toBe(DEFAULT_TABLE_SORT)
    expect(coerceTableSort(42, defs)).toBe(DEFAULT_TABLE_SORT)
    expect(coerceTableSort('', defs)).toBe('')
  })

  it('keeps attribute-id sorts until definitions are available', () => {
    const persisted = `${defs.attributes[0].id}:asc`
    expect(coerceTableSort(persisted)).toBe(persisted)
    expect(coerceTableSort('a_name__en:desc')).toBe('a_name__en:desc')
  })
})

describe('coerceTableGroupBy', () => {
  it('clears unknown group fields', () => {
    expect(coerceTableGroupBy('type_key', defs)).toBe('type_key')
    expect(coerceTableGroupBy('nope', defs)).toBe('')
    expect(coerceTableGroupBy(99, defs)).toBe('')
  })
})