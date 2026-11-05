import { describe, expect, it } from 'vitest'
import type { DefsJson } from './catalog'
import { defaultColumnIdsForType } from './columns'

const defs: DefsJson = {
  attributes: [
    { id: 'number', key: 'number', labels: { en: 'Number' }, kind: { type: 'text' } },
    { id: 'name', key: 'name', labels: { en: 'Name' }, kind: { type: 'text' } },
    { id: 'status', key: 'status', labels: { en: 'Status' }, kind: { type: 'value_list' }, show_by_default: false },
    { id: 'brand', key: 'brand', labels: { en: 'Brand' }, kind: { type: 'text' } },
    { id: 'gtin', key: 'gtin', labels: { en: 'GTIN' }, kind: { type: 'text' } },
    { id: 'net_weight', key: 'net_weight', labels: { en: 'Net weight' }, kind: { type: 'number' } },
  ],
  types: [
    { key: 'product', attributes: ['number', 'name', 'status', 'brand'] },
    { key: 'article', attributes: ['number', 'name', 'status', 'gtin', 'net_weight'] },
  ],
}

describe('default table columns', () => {
  it('filters out preferred attributes with show_by_default false', () => {
    expect(defaultColumnIdsForType('product', defs)).toEqual(['number', 'name', 'brand'])
  })

  it('keeps preferred attributes whose flag is true or missing', () => {
    const shown = {
      ...defs,
      attributes: (defs.attributes as DefsJson[]).map((item) => (
        item.key === 'status' ? { ...item, show_by_default: true } : item
      )),
    }
    expect(defaultColumnIdsForType('product', shown)).toEqual(['number', 'name', 'status', 'brand'])
    expect(defaultColumnIdsForType('article', shown)).toEqual(['number', 'name', 'gtin', 'status', 'net_weight'])
  })

  it('always keeps identity columns even when they are hidden', () => {
    const hiddenIdentity = {
      ...defs,
      attributes: (defs.attributes as DefsJson[]).map((item) => (
        item.key === 'number' || item.key === 'name' ? { ...item, show_by_default: false } : item
      )),
    }
    expect(defaultColumnIdsForType('product', hiddenIdentity)).toEqual(['number', 'name', 'brand'])
  })
})
