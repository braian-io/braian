import { describe, expect, it } from 'vitest'
import { ROW_ORDER_KEY } from './standard-editable-table'
import { buildAttributeReorderStep } from './attribute-reorder-steps'

describe('attribute reorder steps', () => {
  it('builds reorder_type_attributes for types', () => {
    const rows = [
      { id: '1', key: 'name', label: 'Name' },
      { id: '2', key: 'a', label: 'A' },
      { id: '3', key: 'b', label: 'B' },
    ]
    const draftRows = {
      [ROW_ORDER_KEY]: ['1', '3', '2'],
    } as unknown as Record<string, typeof rows[number]>
    expect(buildAttributeReorderStep({ kind: 'type', typeKey: 'product' }, rows, draftRows)).toEqual({
      op: 'reorder_type_attributes',
      type_key: 'product',
      attributes: ['name', 'b', 'a'],
    })
  })

  it('builds reorder_attributes for groups without inherited rows', () => {
    const rows = [
      { id: '1', key: 'a', label: 'A', inherited: true },
      { id: '2', key: 'b', label: 'B' },
      { id: '3', key: 'c', label: 'C' },
    ]
    const draftRows = {
      [ROW_ORDER_KEY]: ['1', '3', '2'],
    } as unknown as Record<string, typeof rows[number]>
    expect(buildAttributeReorderStep({ kind: 'group', structure: 'food', group: 'dairy' }, rows, draftRows)).toEqual({
      op: 'reorder_attributes',
      structure: 'food',
      group: 'dairy',
      attributes: ['c', 'b'],
    })
  })
})