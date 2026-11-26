import { describe, expect, it } from 'vitest'
import { buildTypeHeaderSteps, typeHeaderPatchDirty } from './type-header-table-steps'

describe('type header table steps', () => {
  it('stages rename, update and set_structures together', () => {
    const patch = {
      typeKey: { base: 'product', value: 'article' },
      singular: { base: 'Product', value: 'Article' },
      structures: { base: ['s1'], value: ['s1', 's2'] },
    }
    expect(typeHeaderPatchDirty(patch)).toBe(true)
    expect(buildTypeHeaderSteps('product', patch, 'en')).toEqual([
      { op: 'rename_type_key', key: 'product', new_key: 'article' },
      { op: 'update_type', key: 'article', language: 'en', singular: 'Article' },
      { op: 'set_structures', type_key: 'article', structures: ['s1', 's2'] },
    ])
  })
})