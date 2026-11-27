import { describe, expect, it } from 'vitest'
import { buildTableCopyTsv, escapeTsvCell } from './table-copy-tsv'

describe('escapeTsvCell', () => {
  it('leaves plain values unchanged', () => {
    expect(escapeTsvCell('Bread')).toBe('Bread')
  })

  it('quotes fields with tabs, newlines, and double quotes', () => {
    expect(escapeTsvCell('a\tb')).toBe('"a\tb"')
    expect(escapeTsvCell('line1\nline2')).toBe('"line1\nline2"')
    expect(escapeTsvCell('say "hi"')).toBe('"say ""hi"""')
  })
})

describe('buildTableCopyTsv', () => {
  const rows = [
    { id: 'b', key: 'B-2', type: 'product', version: '1', name: 'Two', status: 'draft', doc: {} },
    { id: 'a', key: 'B-1', type: 'product', version: '1', name: 'One', status: 'draft', doc: {} },
  ]

  it('writes headers and selected rows in table order with tabs', () => {
    const text = buildTableCopyTsv({
      columns: ['number', 'name'],
      headers: ['Number', 'Name'],
      rowsInOrder: rows,
      selectedIds: ['a', 'b'],
      defs: undefined,
      pathValues: undefined,
      language: 'en',
    })
    expect(text).toBe('Number\tName\nB-2\tTwo\nB-1\tOne\n')
  })
})