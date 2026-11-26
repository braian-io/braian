import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { copy } from './i18n'
import { leaves } from './layout'
import { filterPaletteRows, visibleRows } from './palette-model'
import {
  createWorkspaceFromSavedTemplate,
  isNewFromTemplateRoot,
  newFromTemplateRootItem,
  newFromTemplateSubmenuRows,
  savedTemplatePaletteItem,
  templatePaletteItem,
  workspaceTemplateFromSavedTemplate,
  type SavedWorkspaceTemplate,
} from './palette-new-from-template'
import { workspaceTemplates } from './templates'
import { typeShareToken } from './type-workspaces'
import type { TypeName } from './type-labels'

const types: TypeName[] = [
  { id: 't-product', key: 'product', kind: 'object', singular: 'Product', plural: 'Products' },
  { id: 't-article', key: 'article', kind: 'object', singular: 'Article', plural: 'Articles' },
]

const saved: SavedWorkspaceTemplate = {
  key: 'saved-review',
  name: 'Saved review',
  updated_at: '2026-11-03T08:00:00Z',
  definition: {
    views: [
      { id: 'main', type: 'object_table', title: 'Products', state: { type_key: 'product' } },
      { id: 'detail', type: 'object_detail', title: 'Detail', state: { language: 'en' } },
    ],
    layout: {
      type: 'split',
      dir: 'horizontal',
      ratios: [0.6, 0.4],
      children: [
        { type: 'tabs', views: ['main'], active: 0 },
        { type: 'tabs', views: ['detail'], active: 0 },
      ],
    },
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('new from template palette helpers', () => {
  it('shows New from template › when typing template', () => {
    const root = newFromTemplateRootItem()
    const rows = visibleRows('template', [root], [], {})
    expect(rows.some((row) => (row.sourceId ?? row.id) === 'workspace:new')).toBe(true)
    expect(root.title).toBe(`${copy.newWorkspace} ›`)
  })

  it('lists both built-in and saved templates under the submenu', () => {
    const rows = newFromTemplateSubmenuRows(types, [], [saved])
    expect(rows.map((row) => row.title)).toEqual(
      expect.arrayContaining(['Products', 'Articles', 'Data model', 'Review', 'Saved review']),
    )
    expect(rows.some((row) => row.id === 'template:review')).toBe(true)
    expect(rows.some((row) => row.id === 'saved-template:saved-review')).toBe(true)
    expect(rows.some((row) => /Recent|On selected/i.test(row.title))).toBe(false)
  })

  it('recognises the root id', () => {
    expect(isNewFromTemplateRoot('workspace:new')).toBe(true)
    expect(isNewFromTemplateRoot('template:model')).toBe(false)
  })

  it('filters submenu rows so Enter can pick Review by query', () => {
    const rows = newFromTemplateSubmenuRows(types)
    expect(filterPaletteRows(rows, 'Review').map((row) => row.title)).toEqual(['Review'])
  })

  it('marks Create vs Open existing from share_token presence', () => {
    const review = workspaceTemplates(types).find((item) => item.id === 'review')
    expect(review).toBeTruthy()
    expect(templatePaletteItem(review!).subtitle).toMatch(/^Create · /)
    expect(
      templatePaletteItem(review!, [{ id: 'w1', name: 'Review', share_token: 'braian-review' }]).subtitle,
    ).toMatch(/^Open existing · /)
    const model = workspaceTemplates(types).find((item) => item.id === 'model')!
    expect(
      templatePaletteItem(model, [{ id: 'w3', name: 'Data model', share_token: 'braian-model' }]).subtitle,
    ).toMatch(/^Open existing · /)
    const product = workspaceTemplates(types).find((item) => item.id === 'type:product')!
    expect(product).toBeTruthy()
    expect(templatePaletteItem(product).subtitle).toMatch(/^Create · /)
    expect(
      templatePaletteItem(product, [
        { id: 'w2', name: 'Products', share_token: typeShareToken('product') },
      ]).subtitle,
    ).toMatch(/^Create · /)
    const rows = newFromTemplateSubmenuRows(types, [
      { id: 'w1', name: 'Review', share_token: 'braian-review' },
      { id: 'w2', name: 'Products', share_token: typeShareToken('product') },
    ])
    const reviewRow = rows.find((row) => row.id === 'template:review')
    expect(reviewRow?.subtitle).toMatch(/^Open existing · /)
    const modelRow = rows.find((row) => row.id === 'template:model')
    expect(modelRow?.subtitle).toMatch(/^Create · /)
    const productRow = rows.find((row) => row.id === 'template:type:product')
    expect(productRow?.subtitle).toMatch(/^Create · /)
    expect(productRow?.subtitle).not.toMatch(/Open existing/)
  })

  it('builds a fresh workspace template from a saved layout definition', () => {
    const template = workspaceTemplateFromSavedTemplate(saved)
    const ids = ['new-main', 'new-detail']
    expect(template.name).toBe('Saved review')
    expect(template.views.map((view) => view.type)).toEqual(['object_table', 'object_detail'])
    expect(leaves(template.layout(ids)).map((leaf) => leaf.views)).toEqual([['new-main'], ['new-detail']])
    expect(savedTemplatePaletteItem(saved).id).toBe('saved-template:saved-review')
  })

  it('errors on an invalid saved template and creates nothing', async () => {
    const post = vi.spyOn(api, 'post')
    await expect(
      createWorkspaceFromSavedTemplate({
        key: 'broken',
        name: 'Broken template',
        definition: {
          views: [{ id: 'main', type: 'object_table', title: 'Products' }],
          layout: { type: 'tabs', views: ['missing'], active: 0 },
        },
      }),
    ).rejects.toThrow(/Broken template.*not defined/)
    expect(post).not.toHaveBeenCalled()
  })
})
