import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import { applicableDetailKeys, splitDetailKeys } from './detail-fields'

const defs: Json = {
  attributes: [
    { id: 'name', key: 'name', labels: { en: 'Name' }, kind: { type: 'text' } },
    { id: 'status', key: 'status', labels: { en: 'Status' }, kind: { type: 'text' }, show_by_default: true },
    { id: 'hidden', key: 'hidden', labels: { en: 'Hidden' }, kind: { type: 'text' }, show_by_default: false },
  ],
}

describe('detail fields', () => {
  it('puts show_by_default false behind more and keeps missing flags primary', () => {
    const { primaryKeys, moreKeys } = splitDetailKeys(defs, ['number', 'status', 'hidden', 'unknown'])
    expect(primaryKeys).toEqual(['number', 'status', 'unknown'])
    expect(moreKeys).toEqual(['hidden'])
  })

  it('keeps every key primary when nothing is hidden', () => {
    const { primaryKeys, moreKeys } = splitDetailKeys(defs, ['name', 'status'])
    expect(primaryKeys).toEqual(['name', 'status'])
    expect(moreKeys).toEqual([])
  })

  it('includes an ancestor group attribute that has no stored value', () => {
    const model: Json = {
      attributes: [
        { id: 'name', key: 'name', labels: { en: 'Name' }, kind: { type: 'text' } },
        { id: 'fat', key: 'fat_content', labels: { en: 'Fat content' }, kind: { type: 'number' } },
      ],
      types: [{ key: 'product', attributes: ['name'] }],
      structures: [{
        key: 'food',
        groups: [
          { id: 'dairy', key: 'dairy', attributes: ['fat'] },
          { id: 'milk', key: 'milk', parent: 'dairy', attributes: [] },
        ],
        classes: [],
      }],
    }
    expect(applicableDetailKeys(model, 'product', { food: 'milk' })).toEqual(['name', 'fat_content'])
  })
})
