import { describe, expect, it } from 'vitest'
import {
  isSelectSourceRoot,
  parseSelectSourceChoice,
  selectSourceRootItem,
  selectSourceSubmenuRows,
  SELECT_SOURCE_ROOT_ID,
} from './palette-select-source'
import { copy } from './i18n'
import type { TypeName } from './type-labels'

const types: TypeName[] = [
  { id: 't-article', key: 'article', singular: 'Article', plural: 'Articles', kind: 'entity' },
  { id: 't-link', key: 'contains', singular: 'Contains', plural: 'Contains', kind: 'link' },
]

describe('palette select source', () => {
  it('builds a Data source root and type rows (no link types)', () => {
    expect(selectSourceRootItem().id).toBe(SELECT_SOURCE_ROOT_ID)
    expect(selectSourceRootItem().title).toContain(copy.dataSource)
    const rows = selectSourceSubmenuRows(types)
    expect(rows.map((row) => row.id)).toEqual(['select-source:type:t-article'])
    expect(rows[0].title).toBe(copy.allOfType.replace('{type}', 'Articles'))
  })

  it('parses type choices and recognizes the root', () => {
    expect(isSelectSourceRoot(SELECT_SOURCE_ROOT_ID)).toBe(true)
    expect(parseSelectSourceChoice('select-source:type:t-article')).toEqual({ typeId: 't-article' })
    expect(parseSelectSourceChoice(SELECT_SOURCE_ROOT_ID)).toBeNull()
  })
})

describe('palette peer sources (Notion 103 PR 2)', () => {
  it('puts live peer sources under their matching all-of-type row', () => {
    const rows = selectSourceSubmenuRows(types, [
      {
        viewId: 'view-food',
        viewTitle: 'Food',
        selection: 'node',
        label: 'Cheese',
        typeIds: ['t-article'],
      },
      {
        viewId: 'view-suppliers',
        viewTitle: 'Suppliers',
        selection: 'row',
        label: 'SUP-1',
        typeIds: ['t-article'],
      },
      {
        viewId: 'view-unrelated',
        viewTitle: 'Unrelated',
        selection: 'row',
        label: 'X',
        typeIds: ['t-other'],
      },
    ])
    expect(rows.map((row) => row.id)).toEqual([
      'select-source:type:t-article',
      'select-source:peer:t-article:view-food:node',
      'select-source:peer:t-article:view-suppliers:row',
    ])
    expect(rows[1].title).toBe(copy.fromSourceLabel.replace('{type}', 'Articles').replace('{source}', 'Food'))
    expect(rows[1].subtitle).toBe('Cheese')
  })

  it('marks the current all-of-type row, including when no source is stored', () => {
    const rows = selectSourceSubmenuRows(types, [], { typeId: 't-article' })
    expect(rows[0].chips).toEqual([{ text: copy.current, tone: 'ok' }])
    expect(rows.filter((row) => row.chips?.some((chip) => chip.text === copy.current))).toHaveLength(1)
  })

  it('marks the current peer source instead of all-of-type', () => {
    const peerOptions = [
      { viewId: 'view-food', viewTitle: 'Food', selection: 'node' as const, label: 'Cheese', typeIds: ['t-article'] },
    ]
    const rows = selectSourceSubmenuRows(types, peerOptions, {
      typeId: 't-article',
      peerViewId: 'view-food',
      selection: 'node',
    })
    expect(rows[0].chips).toBeUndefined()
    expect(rows[1].chips).toEqual([{ text: copy.current, tone: 'ok' }])
  })

  it('does not mark a peer source with a different selection', () => {
    const peerOptions = [
      { viewId: 'view-food', viewTitle: 'Food', selection: 'node' as const, label: 'Cheese', typeIds: ['t-article'] },
    ]
    const rows = selectSourceSubmenuRows(types, peerOptions, {
      typeId: 't-article',
      peerViewId: 'view-food',
      selection: 'row',
    })
    expect(rows.some((row) => row.chips?.some((chip) => chip.text === copy.current))).toBe(false)
  })

  it('shows one row per link type when several connect the source and target', () => {
    const rows = selectSourceSubmenuRows(types, [
      {
        viewId: 'view-products',
        viewTitle: 'Products',
        selection: 'row',
        label: 'PROD-1',
        typeIds: ['t-article'],
        links: [
          { typeId: 't-article', linkType: 'contains' },
          { typeId: 't-article', linkType: 'related' },
        ],
      },
    ], {
      typeId: 't-article',
      peerViewId: 'view-products',
      selection: 'row',
      linkType: 'related',
    })
    const peerRows = rows.filter((row) => row.id.includes(':peer:'))
    expect(peerRows.map((row) => row.id)).toEqual([
      'select-source:peer:t-article:view-products:row:contains',
      'select-source:peer:t-article:view-products:row:related',
    ])
    expect(peerRows[0].title).toBe('Articles from Products via contains')
    expect(peerRows[1].title).toBe('Articles from Products via related')
    expect(peerRows[0].chips).toBeUndefined()
    expect(peerRows[1].chips).toEqual([{ text: copy.current, tone: 'ok' }])
  })

  it('parses peer choices with an optional link type and still ignores the link type as a source', () => {
    expect(parseSelectSourceChoice('select-source:peer:t-article:view-food:node')).toEqual({
      peerViewId: 'view-food',
      selection: 'node',
    })
    expect(parseSelectSourceChoice('select-source:peer:t-article:view-food:row:contains')).toEqual({
      peerViewId: 'view-food',
      selection: 'row',
      linkType: 'contains',
    })
    const rows = selectSourceSubmenuRows(types, [
      { viewId: 'v', viewTitle: 'Food', selection: 'node', label: 'Cheese', typeIds: ['t-link'] },
    ])
    expect(rows.some((row) => row.id.includes(':peer:'))).toBe(false)
  })
})
