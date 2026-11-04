import { describe, expect, it } from 'vitest'
import type { Json } from './api'
import { commandTitle } from './command-registry'
import { buildRowContextMenu } from './row-context-menu'

const defs: Json = {
  types: [
    { id: '200', key: 'product', kind: 'entity', singular: { en: 'Product' } },
    { id: '201', key: 'article', kind: 'entity', singular: { en: 'Article' } },
    { id: '202', key: 'supplier', kind: 'entity', singular: { en: 'Supplier' } },
    {
      id: '210',
      key: 'product_articles',
      kind: 'link',
      link: {
        from_types: ['200'],
        to_types: ['201'],
        from_label: { key: 'product', labels: { en: 'Product' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
      },
    },
    {
      id: '211',
      key: 'supplier_articles',
      kind: 'link',
      link: {
        from_types: ['202'],
        to_types: ['201'],
        from_label: { key: 'supplier', labels: { en: 'Supplier' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
      },
    },
    {
      id: '212',
      key: 'product_articles',
      kind: 'link',
      link: {
        from_types: ['200', '200'],
        to_types: ['201'],
        from_label: { key: 'product', labels: { en: 'Product' } },
        to_label: { key: 'articles', labels: { en: 'Articles' } },
      },
    },
    {
      id: '213',
      key: 'replaces',
      kind: 'link',
      link: {
        from_types: ['201'],
        to_types: ['201'],
        from_label: { key: 'replaces', labels: { en: 'Replaces' } },
        to_label: { key: 'replaced_by', labels: { en: 'Replaced by' } },
      },
    },
  ],
}

function menu(rowType: string) {
  const { target, items } = buildRowContextMenu({
    context: 'row',
    defs,
    rowType,
    target: { objectId: 'o1' },
  })
  return {
    items,
    titles: items.map((item) => commandTitle(item, target)),
    linkTitles: items
      .filter((item) => item.id.startsWith('link:add:'))
      .map((item) => commandTitle(item, target)),
  }
}

describe('row context menu', () => {
  it('dedupes link entries per link type and direction', () => {
    expect(menu('product').linkTitles).toEqual(['Link to Articles'])
    expect(menu('article').linkTitles).toEqual([
      'Link to Product',
      'Link to Supplier',
      'Link to Replaced by',
      'Link to Replaces',
    ])
  })

  it('labels Open from the clicked row type', () => {
    expect(menu('product').titles).toContain('Open Product')
    expect(menu('article').titles).toContain('Open Article')
    expect(menu('article').titles).not.toContain('Open Product')
  })

  it('offers to link the selection when several rows are selected', () => {
    const { items } = buildRowContextMenu({
      context: 'cell',
      defs,
      rowType: 'article',
      target: { objectId: 'o1' },
      selectedCount: 3,
    })
    expect(items.map((item) => commandTitle(item, { objectId: 'o1' }))).toContain('Link selected to…')
    expect(menu('article').titles).not.toContain('Link selected to…')
  })

  it('uses the reverse label for reverse-direction link entries', () => {
    const titles = menu('article').linkTitles
    expect(titles).toContain('Link to Product')
    expect(titles).not.toContain('Link to Articles')
  })
})
