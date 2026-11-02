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

  it('parses peer choices and still ignores the link type', () => {
    expect(parseSelectSourceChoice('select-source:peer:t-article:view-food:node')).toEqual({
      peerViewId: 'view-food',
      selection: 'node',
    })
    const rows = selectSourceSubmenuRows(types, [
      { viewId: 'v', viewTitle: 'Food', selection: 'node', label: 'Cheese', typeIds: ['t-link'] },
    ])
    expect(rows.some((row) => row.id.includes(':peer:'))).toBe(false)
  })
})
