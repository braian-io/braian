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
