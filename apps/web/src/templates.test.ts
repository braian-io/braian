import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, type Json } from './api'
import { leaves } from './layout'
import { typeNames } from './type-labels'
import {
  canonicalShareToken,
  createWorkspaceFromTemplate,
  isTypeWorkspaceTemplate,
  nextWorkspaceName,
  typeWorkspaceTemplate,
  workspaceTemplates,
} from './templates'
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

describe('nextWorkspaceName', () => {
  it('starts at 2 and takes the next free numbered name', () => {
    expect(nextWorkspaceName('Products', ['Products'])).toBe('Products 2')
    expect(nextWorkspaceName('Products', ['Products', 'Products 2'])).toBe('Products 3')
    expect(nextWorkspaceName('Products', ['Products', 'Products 2', 'Products 4'])).toBe('Products 3')
    expect(nextWorkspaceName('Products', ['Products', 'Products 20'])).toBe('Products 2')
    expect(nextWorkspaceName('Products', ['Articles'])).toBe('Products 2')
  })
})

describe('createWorkspaceFromTemplate forceNew', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  type Row = { id: string; name: string; share_token?: string | null }

  function productTemplate() {
    const type = typeNames(defs, 'en').find((item) => item.key === 'product')!
    return typeWorkspaceTemplate(type, defs)
  }

  function mockApi(rows: Row[]) {
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/v1/definitions') return defs as never
      if (path === '/v1/workspaces') return { workspaces: rows } as never
      return {} as never
    })
    return { post: vi.spyOn(api, 'post').mockResolvedValue({} as never) }
  }

  function createdBody(post: ReturnType<typeof mockApi>['post']) {
    const call = post.mock.calls.find((entry) => entry[0] === '/v1/workspaces')
    return (call?.[1] as { body?: { name?: string; share_token?: string } } | undefined)?.body
  }

  it('creates a uniquely named personal copy when the canonical workspace exists', async () => {
    const { post } = mockApi([
      { id: 'w-products', name: 'Products', share_token: typeShareToken('product') },
      { id: 'w-articles', name: 'Articles', share_token: typeShareToken('article') },
    ])
    const template = productTemplate()
    await expect(createWorkspaceFromTemplate(template, { forceNew: true })).resolves.not.toBe('w-products')
    expect(createdBody(post)?.name).toBe('Products 2')
    expect(createdBody(post)?.share_token).toMatch(/^user-/)
    expect(post.mock.calls.filter((entry) => entry[0] === '/v1/views')).toHaveLength(template.views.length)
  })

  it('keeps the canonical name and share token when no canonical workspace exists', async () => {
    const { post } = mockApi([
      { id: 'w-articles', name: 'Articles', share_token: typeShareToken('article') },
    ])
    await expect(createWorkspaceFromTemplate(productTemplate(), { forceNew: true })).resolves.not.toBe('w-articles')
    expect(createdBody(post)?.name).toBe('Products')
    expect(createdBody(post)?.share_token).toBe(typeShareToken('product'))
  })

  it('reopens the canonical workspace without forceNew', async () => {
    const { post } = mockApi([
      { id: 'w-products', name: 'Products', share_token: typeShareToken('product') },
    ])
    await expect(createWorkspaceFromTemplate(productTemplate())).resolves.toBe('w-products')
    expect(post).not.toHaveBeenCalled()
  })

  it('recognises object-type templates', () => {
    expect(isTypeWorkspaceTemplate(productTemplate())).toBe(true)
    expect(isTypeWorkspaceTemplate(workspaceTemplates([]).find((item) => item.id === 'model')!)).toBe(false)
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
