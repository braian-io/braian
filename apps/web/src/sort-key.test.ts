import { describe, expect, it } from 'vitest'
import { headerSortState, normalizeTableSort, sortKeyForColumnId } from './index-fields'

const defs = {
  attributes: [
    { id: '11111111-1111-7111-8111-111111111101', key: 'name', language_dependent: true, index: { searchable: true, filterable: true, sortable: true } },
    { id: '11111111-1111-7111-8111-111111111102', key: 'brand', language_dependent: false, index: { searchable: true, filterable: true, sortable: true } },
    { id: '11111111-1111-7111-8111-111111111103', key: 'notes', language_dependent: true, index: { searchable: true, filterable: false, sortable: false } },
  ],
}

describe('sortKeyForColumnId', () => {
  it('maps number/key and name like the builtins', () => {
    expect(sortKeyForColumnId('number', defs)).toBe('a_number')
    expect(sortKeyForColumnId('key', defs)).toBe('a_number')
    expect(sortKeyForColumnId('name', defs)).toBe('a_11111111_1111_7111_8111_111111111101__en')
  })

  it('maps brand via attribute id when sortable', () => {
    expect(sortKeyForColumnId('brand', defs)).toBe('a_11111111_1111_7111_8111_111111111102')
  })

  it('returns empty for searchable-only and hops', () => {
    expect(sortKeyForColumnId('notes', defs)).toBe('')
    expect(sortKeyForColumnId('packaging>name', defs)).toBe('')
  })
})

describe('headerSortState', () => {
  it('matches persisted attribute-id sorts to the name column sort field', () => {
    const nameId = String(defs.attributes[0].id)
    const key = sortKeyForColumnId('name', defs)
    expect(normalizeTableSort(`${nameId}:asc`, defs)).toBe(`${key}:asc`)
    expect(headerSortState(`${nameId}:asc`, key, defs)).toBe('asc')
    expect(headerSortState(`${nameId}:desc`, key, defs)).toBe('desc')
  })

  it('matches legacy a_name tokens to the name column sort field', () => {
    const key = sortKeyForColumnId('name', defs)
    expect(headerSortState('a_name__en:asc', key, defs)).toBe('asc')
    expect(headerSortState('a_name__en:desc', key, defs)).toBe('desc')
    expect(headerSortState(`${key}:asc`, key, defs)).toBe('asc')
  })

  it('returns false for an unrelated column or cleared sort', () => {
    const key = sortKeyForColumnId('name', defs)
    expect(headerSortState('', key, defs)).toBe(false)
    expect(headerSortState('a_number:asc', key, defs)).toBe(false)
  })
})
