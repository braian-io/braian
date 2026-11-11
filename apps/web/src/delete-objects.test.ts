import { describe, expect, it } from 'vitest'
import { dryRunFrom, linkedObjectIds, mergeDeleteCounts, type DeleteDryRun } from './delete-objects'

const run = (objects: number, links: number, sentence = ''): DeleteDryRun => ({
  objects,
  links,
  sentence: sentence || `Removes ${objects} objects and ${links} links`,
  detail: [sentence || `Removes ${objects} objects and ${links} links`],
})

describe('delete object counts', () => {
  it('reuses the server sentence and detail for one object', () => {
    const counts = mergeDeleteCounts(['a'], new Map([['a', run(2, 1, 'Removes 2 objects and 1 links')]]), new Map())
    expect(counts).toEqual({
      objects: 2,
      links: 1,
      sentence: 'Removes 2 objects and 1 links',
      detail: ['Removes 2 objects and 1 links'],
    })
  })

  it('counts a link touched by two selected objects once', () => {
    const counts = mergeDeleteCounts(
      ['a', 'b'],
      new Map([['a', run(2, 1)], ['b', run(2, 1)]]),
      new Map([['a', ['link-1']], ['b', ['link-1']]]),
    )
    expect(counts).toEqual({
      objects: 3,
      links: 1,
      sentence: 'Removes 3 objects and 1 links',
      detail: [],
    })
  })

  it('ignores a selected link object in the shared link set', () => {
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
