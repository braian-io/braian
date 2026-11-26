import { describe, expect, it } from 'vitest'
import { memberIdFilter } from './assortment-filter'
import { needsRemoveConfirm, objectIdsFromTarget } from './selection-members'

describe('manual selection members', () => {
  it('asks before removing more than one row', () => {
    expect(needsRemoveConfirm(1)).toBe(false)
    expect(needsRemoveConfirm(2)).toBe(true)
  })

  it('reads the selected object ids and never needs a typed id', () => {
    expect(objectIdsFromTarget({
      objectId: 'fallback',
      objects: [{ id: 'a' }, { id: 'b' }, { id: 'a' }],
    })).toEqual(['a', 'b'])
    expect(objectIdsFromTarget({ objectId: 'only' })).toEqual(['only'])
  })

  it('builds the Typesense id filter the table reads', () => {
    expect(memberIdFilter(['a', 'b'])).toBe('id:=[`a`,`b`]')
    expect(memberIdFilter([])).toBe('id:=__braian_empty_manual__')
  })
})
