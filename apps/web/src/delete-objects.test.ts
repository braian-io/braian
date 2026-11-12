import { describe, expect, it } from 'vitest'
import { dryRunFrom, linkedObjectIds, mergeDeleteCounts, type DeleteDryRun } from './delete-objects'

const run = (objects: number, links: number, sentence = ''): DeleteDryRun => ({
  objects,
  links,
  sentence: sentence || `Removes ${objects} objects and ${links} links`,
  detail: [sentence || `Removes ${objects} objects and ${links} links`],
})

describe('delete object counts', () => {
  it('names one object and one link once, in the singular', () => {
    const counts = mergeDeleteCounts(
      ['a'],
      new Map([['a', run(1, 1, 'Removes 1 object and 1 link')]]),
      new Map([['a', ['link-1']]]),
    )
    expect(counts).toEqual({
      objects: 1,
      links: 1,
      sentence: 'Removes 1 object and 1 link',
      detail: [],
    })
  })

  it('does not reuse a server sentence that counted a link object as an object', () => {
    const counts = mergeDeleteCounts(['a'], new Map([['a', run(2, 1)]]), new Map([['a', ['link-1']]]))
    expect(counts).toEqual({
      objects: 1,
      links: 1,
      sentence: 'Removes 1 object and 1 link',
      detail: [],
    })
  })

  it('falls back to the dry-run link count when the object body has no links', () => {
    const counts = mergeDeleteCounts(['a'], new Map([['a', run(1, 3)]]), new Map())
    expect(counts).toMatchObject({ objects: 1, links: 3, sentence: 'Removes 1 object and 3 links' })
  })

  it('counts a link touched by two selected objects once', () => {
    const counts = mergeDeleteCounts(
      ['a', 'b'],
      new Map([['a', run(1, 1)], ['b', run(1, 1)]]),
      new Map([['a', ['link-1']], ['b', ['link-1']]]),
    )
    expect(counts).toEqual({
      objects: 2,
      links: 1,
      sentence: 'Removes 2 objects and 1 link',
      detail: [],
    })
  })

  it('counts merged unique links across a multi-selection', () => {
    const counts = mergeDeleteCounts(
      ['a', 'b'],
      new Map([['a', run(1, 1)], ['b', run(1, 1)]]),
      new Map([['a', ['link-1', 'link-2']], ['b', ['link-2', 'link-3']]]),
    )
    expect(counts).toMatchObject({
      objects: 2,
      links: 3,
      sentence: 'Removes 2 objects and 3 links',
    })
  })

  it('keeps a selected link id out of the link count', () => {
    const counts = mergeDeleteCounts(
      ['a', 'b'],
      new Map([['a', run(2, 1)], ['b', run(1, 1)]]),
      new Map([['a', ['b']], ['b', []]]),
    )
    expect(counts.objects).toBe(2)
    expect(counts.links).toBe(0)
  })

  it('reads counts and link ids from the response bodies', () => {
    expect(dryRunFrom({ objects: '2', links: 3, sentence: 'Removes 2 objects and 3 links' }))
      .toMatchObject({ objects: 0, links: 3 })
    expect(linkedObjectIds({
      links: [
        { direction: 'out', links: [{ id: 'l1' }, { id: 'l2' }] },
        { direction: 'in', links: [{ id: 'l2' }] },
      ],
    })).toEqual(['l1', 'l2'])
  })
})
