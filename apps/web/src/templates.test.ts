import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import { leaves } from './layout'
import { typeNames } from './type-labels'
import { canonicalShareToken, typeWorkspaceTemplate, workspaceTemplates } from './templates'
import { typeShareToken } from './type-workspaces'

const defs: Json = {
  attributes: [{ id: 'name', key: 'name', labels: { en: 'Name' }, kind: { type: 'text' } }],
  types: [
    { id: '200', key: 'product', singular: { en: 'Product' }, plural: { en: 'Products' }, attributes: ['name'], structures: ['food'] },
    { id: '201', key: 'article', singular: { en: 'Article' }, plural: { en: 'Articles' }, attributes: ['name'], structures: ['food'] },
    { id: '202', key: 'supplier', singular: { en: 'Supplier' }, plural: { en: 'Suppliers' }, attributes: ['name'], structures: [] },
    { id: '210', key: 'product_articles', kind: 'link', link: { from_types: ['200'], to_types: ['201'] } },
  ],
  structures: [{ key: 'food', labels: { en: 'Food' }, groups: [], classes: [] }],
}

describe('canonicalShareToken', () => {
  it('maps model, review and type templates to stable share tokens', () => {
    const templates = workspaceTemplates(typeNames(defs, 'en'), defs)
    expect(canonicalShareToken(templates.find((t) => t.id === 'model')!)).toBe('braian-model')
    expect(canonicalShareToken(templates.find((t) => t.id === 'review')!)).toBe('braian-review')
    expect(canonicalShareToken(templates.find((t) => t.id === 'type:product')!)).toBe(typeShareToken('product'))
  })
})

describe('typeWorkspaceTemplate peer table', () => {
  const types = typeNames(defs, 'en')

  it('adds a peer table for the first linked object type', () => {
    const product = types.find((type) => type.key === 'product')!
    const template = typeWorkspaceTemplate(product, defs)
    expect(template.views.map((view) => view.type)).toEqual([
      'structure_tree',
      'assortment_list',
      'object_table',
      'object_table',
      'object_detail',
      'graph',
      'history',
      'class_attributes',
    ])
    expect(template.views[3]?.title).toBe('Articles')
    const ids = template.views.map((_, index) => `view-${index}`)
    const state = template.views[3]?.state
    expect(typeof state).toBe('function')
    const resolved = typeof state === 'function' ? state(ids) : state
    expect(resolved).toMatchObject({
      object_type: '201',
      type_key: 'article',
      source: { kind: 'peer', viewId: ids[2], selection: 'row' },
    })
    expect(resolved).not.toHaveProperty('source.linkType')
    expect(leaves(template.layout(ids)).map((leaf) => leaf.views)).toEqual([
      [ids[0], ids[1]],
      [ids[2]],
      [ids[3]],
      [ids[4], ids[5], ids[6], ids[7]],
    ])
  })

  it('keeps a type without links unchanged', () => {
    const supplier = types.find((type) => type.key === 'supplier')!
    const template = typeWorkspaceTemplate(supplier, defs)
    expect(template.views.map((view) => view.type)).toEqual([
      'assortment_list',
      'object_table',
      'object_detail',
      'graph',
      'history',
    ])
    expect(template.views.every((view) => typeof view.state !== 'function')).toBe(true)
    const ids = template.views.map((_, index) => `view-${index}`)
    expect(leaves(template.layout(ids)).map((leaf) => leaf.views)).toEqual([
      [ids[0]],
      [ids[1]],
      [ids[2], ids[3], ids[4]],
    ])
  })
})

describe('model template', () => {
  it('lists the Model graph after the model tables', () => {
    const model = workspaceTemplates([]).find((item) => item.id === 'model')!
    expect(model.views.map((view) => ({ type: view.type, title: view.title }))).toEqual([
      { type: 'data_model', title: 'Structures' },
      { type: 'object_types', title: 'Object types' },
      { type: 'link_types', title: 'Link types' },
      { type: 'value_lists', title: 'Value lists' },
      { type: 'value_list_values', title: 'List values' },
      { type: 'units', title: 'Units' },
      { type: 'data_model', title: 'Type attributes' },
      { type: 'attribute_definitions', title: 'Attribute definitions' },
      { type: 'graph', title: 'Model graph' },
    ])
  })
})
