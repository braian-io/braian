import { describe, expect, it } from 'vitest'
import { allowedLinks, choiceLabel, linkDragDenial, linkEndsSummary, linkFieldValues, linkPairExplanation, linkPickerRows, linksForEnds, preferredChoice, type LinkHit } from './link-choices'
import type { Json } from './api'

const defs: Json = {
  attributes: [
    { id: 'created', key: 'created_at', labels: { en: 'Created' }, kind: { type: 'text' } },
    { id: 'sort', key: 'sort_order', labels: { en: 'Sort order' }, kind: { type: 'number', integer: true } },
    { id: 'note', key: 'note', labels: { en: 'Note' }, kind: { type: 'text' } },
  ],
  types: [
    { id: 'type-article', key: 'article', kind: 'entity' },
    { id: 'type-product', key: 'product', kind: 'entity' },
    { id: 'type-supplier', key: 'supplier', kind: 'entity' },
    {
      id: 'link-replaces',
      key: 'replaces',
      kind: 'link',
      attributes: ['created', 'note'],
      link: {
        from_types: ['type-article'],
        to_types: ['type-article'],
        from_label: { labels: { en: 'Replaces' } },
        to_label: { labels: { en: 'Replaced by' } },
      },
    },
    {
      id: 'link-articles',
      key: 'product_articles',
      kind: 'link',
      attributes: ['created', 'sort'],
      link: {
        from_types: ['type-product'],
        to_types: ['type-article'],
        from_label: { labels: { en: 'Product' } },
        to_label: { labels: { en: 'Articles' } },
      },
    },
  ],
}

function hit(partial: Partial<LinkHit> & Pick<LinkHit, 'id' | 'name'>): LinkHit {
  return { key: partial.id, typeKey: 'article', ...partial }
}

describe('allowed link types', () => {
  it('offers both directions when the two objects share a type', () => {
    const choices = allowedLinks(defs, 'article', 'article')
    expect(choices.map((choice) => `${choice.linkType}:${choice.direction}:${choice.label}`)).toEqual([
      'replaces:out:Replaced by',
      'replaces:in:Replaces',
    ])
    expect(choices[0]?.fields.map((field) => field.key)).toEqual(['note'])
  })

  it('offers the one direction a product may use toward an article, with its metadata field', () => {
    const choices = allowedLinks(defs, 'product', 'article')
    expect(choices).toHaveLength(1)
    expect(choices[0]?.linkType).toBe('product_articles')
    expect(choices[0]?.direction).toBe('out')
    expect(choices[0]?.fields.map((field) => field.label)).toEqual(['Sort order'])
  })

  it('has no link type between a product and a supplier', () => {
    expect(allowedLinks(defs, 'product', 'supplier')).toEqual([])
  })

  it('names both types when nothing can link, and what each type can link to', () => {
    expect(linkDragDenial(defs, 'product', ['supplier'])).toBe("products can't link to suppliers")
    expect(linkDragDenial(defs, 'product', ['article'])).toBeNull()
    expect(linkPairExplanation(defs, 'product', ['supplier'])).toBe(
      "products can't link to suppliers. products can link to articles. suppliers can't link to anything.",
    )
  })

  it('shows both ends, and stops the list after five', () => {
    expect(linkEndsSummary(
      { id: 'p', key: 'PROD-CHEDDAR', name: 'Mature cheddar' },
      [{ id: 'a', key: 'ART-CHED-400', name: 'Mature cheddar 400 g' }],
    )).toBe('PROD-CHEDDAR Mature cheddar ← ART-CHED-400 Mature cheddar 400 g')
    const peers = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, key: id, name: id }))
    expect(linkEndsSummary({ id: 'p', key: 'P', name: 'Product' }, peers)).toBe('P Product ← a, b, c, d, e +1 more')
  })

  it('keeps only the link type every dragged object can use', () => {
    expect(linksForEnds(defs, 'product', ['article', 'article']).map((choice) => choice.linkType)).toEqual(['product_articles'])
    expect(linksForEnds(defs, 'product', ['article', 'supplier'])).toEqual([])
  })

  it('keeps the section the person started from when that side is allowed', () => {
    const choices = allowedLinks(defs, 'article', 'article')
    expect(preferredChoice(choices, { linkType: 'replaces', direction: 'in' })?.label).toBe('Replaces')
    expect(preferredChoice(choices, { linkType: 'missing', direction: 'out' })?.direction).toBe('out')
  })

  it('names the direction when two choices share a label', () => {
    const choices = [
      { linkType: 'pairs_with', direction: 'out' as const, label: 'Pairs with', fields: [] },
      { linkType: 'pairs_with', direction: 'in' as const, label: 'Pairs with', fields: [] },
    ]
    expect(choiceLabel(choices[0]!, choices)).toBe('Pairs with · From this object')
    expect(choiceLabel(choices[1]!, choices)).toBe('Pairs with · To this object')
  })
})

describe('link picker ranking', () => {
  const cheddar = hit({ id: 'a400', key: 'ART-CHED-400', name: 'Mature cheddar 400 g' })
  const oat = hit({ id: 'oat', key: 'PROD-OAT', name: 'Organic oat drink', typeKey: 'product' })

  it('ranks a name match above a weaker fuzzy hit and keeps Typesense hits', () => {
    const rows = linkPickerRows({
      hits: [oat, cheddar],
      query: 'cheddar',
      frecency: {},
    })
    expect(rows.map((row) => row.sourceId)).toEqual(['a400', 'oat'])
    expect(rows[0]?.title).toBe('Mature cheddar 400 g')
    expect(rows[0]?.subtitle).toBe('ART-CHED-400')
  })

  it('puts a recently used object first when the query is empty', () => {
    const rows = linkPickerRows({
      hits: [],
      query: '',
      frecency: { 'hit:a400': { uses: 2, last: 20 } },
      memory: [
        { id: 'hit:a400', group: 'search', title: 'Mature cheddar 400 g', subtitle: 'ART-CHED-400' },
        { id: 'hit:oat', group: 'search', title: 'Organic oat drink', subtitle: 'PROD-OAT' },
      ],
    })
    expect(rows.map((row) => row.id)).toEqual(['hit:a400'])
    expect(rows[0]?.group).toBe('recent')
  })
})

describe('link field values', () => {
  it('omits blanks and stores a number as a value object', () => {
    const fields = allowedLinks(defs, 'product', 'article')[0]?.fields ?? []
    expect(linkFieldValues(fields, { sort_order: ' 4 ' })).toEqual({ sort_order: { value: '4' } })
    expect(linkFieldValues(fields, { sort_order: '  ' })).toEqual({})
  })
})
