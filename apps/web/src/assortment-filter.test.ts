import { describe, expect, it } from 'vitest'
import {
  assortmentSearchFilter,
  dynamicSelectionFilter,
  labelSearchFilter,
  selectionFilterText,
  selectionMatchesType,
  selectionQueryValue,
  selectionUsageLines,
} from './assortment-filter'

describe('organic assortment filter', () => {
  const organic = { labels: 'organic_eu' }

  it('filters on the organic_eu label and does not text-search', () => {
    expect(assortmentSearchFilter(organic)).toBe('a_labels:=organic_eu')
    expect(assortmentSearchFilter({ ...organic, text: 'Organic' })).toBe('a_labels:=organic_eu')
    expect(labelSearchFilter(organic)).toBe('a_labels:=organic_eu')
  })

  it('uses the selection type and ignores a type stored on the query', () => {
    expect(
      assortmentSearchFilter({ type: 'article', group: 'food:cheese', labels: ['organic_eu', 'vegan'] }, 'product'),
    ).toBe('type_key:=product && groups:=food:cheese && a_labels:=organic_eu && a_labels:=vegan')
  })

  it('matches nothing extra when the query has no label', () => {
    expect(labelSearchFilter({ type: 'article', text: 'Organic' })).toBe('')
    expect(assortmentSearchFilter({ type: 'article', group: 'food:cheese' }, 'article')).toBe(
      'type_key:=article && groups:=food:cheese',
    )
  })

  it('matches a selection only to its own type', () => {
    const cheese = { type: 'product', type_id: '018f0000-0000-7000-8000-000000000200' }
    expect(selectionMatchesType(cheese, 'product', cheese.type_id)).toBe(true)
    expect(selectionMatchesType(cheese, 'article', '018f0000-0000-7000-8000-000000000201')).toBe(false)
    expect(selectionMatchesType({ type_id: cheese.type_id }, '', cheese.type_id)).toBe(true)
    expect(selectionMatchesType(cheese, '', '')).toBe(false)
  })
})

describe('dynamic selections', () => {
  it('uses the stored filter and keeps one type clause', () => {
    expect(
      assortmentSearchFilter({ filter: 'groups:=food:cheese && a_labels:=organic_eu' }, 'product'),
    ).toBe('type_key:=product && (groups:=food:cheese && a_labels:=organic_eu)')
    expect(
      assortmentSearchFilter({ filter: 'type_key:=article && groups:=food:cheese' }, 'product'),
    ).toBe('type_key:=article && groups:=food:cheese')
  })

  it('reads the filter only from a dynamic query', () => {
    expect(selectionFilterText({ filter: 'type_key:=product' })).toBe('type_key:=product')
    expect(selectionFilterText({ group: 'food:cheese' })).toBe('')
    expect(selectionFilterText('type_key:=product')).toBe('')
  })

  it('adds the view type to a saved filter once', () => {
    expect(dynamicSelectionFilter('groups:=food:cheese', 'product')).toBe(
      'type_key:=product && (groups:=food:cheese)',
    )
    expect(dynamicSelectionFilter('type_key:=product && groups:=food:cheese', 'product')).toBe(
      'type_key:=product && groups:=food:cheese',
    )
    expect(dynamicSelectionFilter('', 'product')).toBe('type_key:=product')
  })

  it('keeps a dynamic query as a string and a manual query as an object', () => {
    expect(selectionQueryValue('dynamic', ' type_key:=product ', {})).toBe('type_key:=product')
    expect(selectionQueryValue('manual', 'ignored', { group: 'food:cheese' })).toEqual({
      group: 'food:cheese',
    })
  })

  it('lists the views, jobs and webhooks that use a selection', () => {
    expect(
      selectionUsageLines({
        views: [{ id: 'v1', title: 'Cheese' }],
        job_types: [{ key: 'dq.status', title: 'Status check' }],
        webhooks: [{ id: 'w1', url: 'https://example.test/hook' }],
      }),
    ).toEqual(['Cheese', 'Status check', 'https://example.test/hook'])
    expect(selectionUsageLines({ views: [], job_types: [], webhooks: [] })).toEqual([])
  })
})
