import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import { describeModelSteps, modelStepSentence } from './model-step-text'

const defs: Json = {
  types: [
    {
      id: 'type-article',
      key: 'article',
      singular: { en: 'Article' },
      plural: { en: 'Articles' },
      labels: { en: 'Article' },
      structures: ['structure-food'],
    },
    {
      id: 'type-product',
      key: 'product',
      singular: { en: 'Product' },
      plural: { en: 'Products' },
      labels: { en: 'Product' },
      structures: ['structure-food', 'structure-market'],
    },
  ],
  attributes: [
    { id: 'attr-country', key: 'country_of_origin', labels: { en: 'Country of origin' } },
    { id: 'attr-show', key: 'show_by_default', labels: { en: 'Show by default' } },
  ],
  structures: [
    {
      id: 'structure-food',
      key: 'food',
      labels: { en: 'Food' },
      groups: [
        { id: 'group-dairy', key: 'dairy', labels: { en: 'Dairy & eggs' } },
      ],
    },
    {
      id: 'structure-market',
      key: 'market',
      labels: { en: 'Market' },
      groups: [],
    },
  ],
  value_lists: [{ id: 'list-status', key: 'status', labels: { en: 'Status' }, options: [{ code: 'draft', labels: { en: 'Draft' } }] }],
  unit_families: [{ id: 'family-weight', key: 'weight', labels: { en: 'Weight' } }],
}

describe('model step sentences', () => {
  it('names the type and the trees in an allowed-tree step', () => {
    expect(modelStepSentence(
      { op: 'set_structures', type_key: 'product', structures: ['structure-food', 'structure-market'] },
      defs,
    )).toBe('Allowed trees for Product: Food, Market')
  })

  it('describes a plural change on an earlier pending step with display names', () => {
    const steps = describeModelSteps([
      { op: 'update_type', key: 'article', plural: 'ArticlesX' },
      { op: 'set_structures', type_key: 'product', structures: ['structure-food'] },
    ], defs)
    expect(steps.map((step) => step.sentence)).toEqual([
      'Set the plural name of Article to ArticlesX',
      'Allowed trees for Product: Food',
    ])
    expect(steps.map((step) => step.allowedTrees)).toEqual([false, true])
    expect(JSON.stringify(steps)).not.toContain('article')
    expect(JSON.stringify(steps)).not.toContain('structure-food')
    expect(JSON.stringify(steps)).not.toContain('type-product')
  })

  it('names a structure by its label for deletes and key changes', () => {
    expect(modelStepSentence({ op: 'delete_structure', structure: 'food' }, defs)).toBe('Delete structure Food')
    expect(modelStepSentence({ op: 'create_structure', key: 'food', label: 'Food' }, defs)).toBe('Create structure Food')
    expect(modelStepSentence({ op: 'rename_group', structure: 'food', group: 'dairy', label: 'Dairy' }, defs))
      .toBe('Rename group to Dairy')
    expect(modelStepSentence({ op: 'move_group', structure: 'food', group: 'dairy', parent: null }, defs))
      .toBe('Move Dairy & eggs under Root')
  })

  it('names attributes, lists and units by label', () => {
    expect(modelStepSentence({ op: 'create_attribute', key: 'country_of_origin', label: '' }, defs))
      .toBe('Create attribute Country of origin')
    expect(modelStepSentence({ op: 'attach_attribute', attribute: 'show_by_default', type_key: 'product' }, defs))
      .toBe('Add Show by default to Product')
    expect(modelStepSentence({ op: 'detach_attribute', attribute: 'show_by_default', structure: 'food', group: 'dairy' }, defs))
      .toBe('Remove Show by default from Dairy & eggs')
    expect(modelStepSentence({ op: 'delete_value_option', list: 'status', option: 'draft' }, defs))
      .toBe('Delete option Draft from Status')
    expect(modelStepSentence({ op: 'delete_unit', family: 'weight', unit: 'kg' }, defs))
      .toBe('Delete unit kg from Weight')
  })

  it('falls back to generic copy instead of a raw key or id', () => {
    const missing = modelStepSentence({ op: 'delete_structure', structure: 'qa129r_0516' }, undefined)
    expect(missing).toBe('Delete structure Structure')
    expect(missing).not.toContain('qa129r')
    expect(modelStepSentence({ op: 'something_new' }, undefined)).toBe('Change the data model')
  })
})
