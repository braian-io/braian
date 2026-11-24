import { describe, expect, it } from 'vitest'
import { ROW_ORDER_KEY } from './standard-editable-table'
import {
  buildValueListReorderStep,
  orderedValueListOptions,
  valueListOptionSteps,
  valueListOptionsOrderChanged,
} from './value-list-table-steps'

const rows = [
  { id: 'colors:red', code: 'red', label: 'Red' },
  { id: 'colors:green', code: 'green', label: 'Green' },
  { id: 'colors:blue', code: 'blue', label: 'Blue' },
]

describe('value list table steps', () => {
  it('detects a reorder and builds update_value_list', () => {
    const draftRows = {
      [ROW_ORDER_KEY]: ['colors:green', 'colors:red', 'colors:blue'],
    } as unknown as Record<string, typeof rows[number]>
    expect(valueListOptionsOrderChanged(rows, draftRows)).toBe(true)
    const step = buildValueListReorderStep('colors', rows, draftRows)
    expect(step).toEqual({
      op: 'update_value_list',
      key: 'colors',
      options: [
        { code: 'green', label: 'Green' },
        { code: 'red', label: 'Red' },
        { code: 'blue', label: 'Blue' },
      ],
    })
  })

  it('keeps a single reorder step when labels are unchanged', () => {
    const draftRows = {
      [ROW_ORDER_KEY]: ['colors:blue', 'colors:green', 'colors:red'],
    } as unknown as Record<string, typeof rows[number]>
    const steps = valueListOptionSteps('colors', rows, draftRows, 'en')
    expect(steps).toEqual([
      {
        op: 'update_value_list',
        key: 'colors',
        options: orderedValueListOptions(rows, draftRows).map((row) => ({ code: row.code, label: row.label })),
      },
    ])
  })
})