import { beforeEach, describe, expect, it } from 'vitest'
import {
  discardObjectDraft,
  draftBaseVersion,
  editBaseVersion,
  noteObjectDraftSaved,
  overlayValues,
  paintObjectCell,
  resetObjectDrafts,
  reviewCapabilities,
  stageObjectCell,
} from './object-draft'
import { draftSavePlan } from './object-draft-save'
import { modelStepKeys, reviewCells } from './review-cells'

beforeEach(() => {
  resetObjectDrafts()
})

describe('shared object draft', () => {
  it('keeps Enter on the draft when a late or older read arrives, in the table and in Detail', () => {
    stageObjectCell({
      objectId: 'obj-1',
      attribute: 'name',
      columnId: 'name',
      language: 'en',
      baseVersion: 3,
      originalText: 'Organic Apples',
      proposedText: 'Organic Apples QA',
      value: 'Organic Apples QA',
    })

    const late = paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name',
      attribute: 'name',
      language: 'en',
      serverText: 'Organic Apples',
      serverVersion: 3,
    })
    expect(late.drafted).toBe(true)
    expect(late.text).toBe('Organic Apples QA')
    expect(late.originalText).toBe('Organic Apples')

    const older = paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name',
      attribute: 'name',
      language: 'en',
      serverText: 'Apples',
      serverVersion: 2,
    })
    expect(older.text).toBe('Organic Apples QA')
    expect(overlayValues('obj-1', { name: { en: 'Organic Apples' } }, 3).name).toEqual({ en: 'Organic Apples QA' })

    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 3 },
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
    })
    expect(plan).toEqual([
      expect.objectContaining({ kind: 'patch', objectId: 'obj-1', version: 3 }),
    ])
    noteObjectDraftSaved('obj-1', 4)

    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name',
      attribute: 'name',
      language: 'en',
      serverText: 'Organic Apples',
      serverVersion: 3,
    }).text).toBe('Organic Apples QA')
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name',
      attribute: 'name',
      language: 'en',
      serverText: 'Organic Apples QA',
      serverVersion: 4,
    }).held).toBe(false)
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name',
      attribute: 'name',
      language: 'en',
      serverText: 'Organic Apples',
      serverVersion: 3,
    }).text).toBe('Organic Apples QA')
  })

  it('Discard clears the same draft the table and Detail share', () => {
    stageObjectCell({
      objectId: 'obj-1',
      attribute: 'status',
      columnId: 'status',
      baseVersion: 1,
      originalText: 'draft',
      proposedText: 'ok',
      value: 'ok',
    })
    expect(draftBaseVersion('obj-1')).toBe(1)
    discardObjectDraft('obj-1')
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'status',
      attribute: 'status',
      serverText: 'draft',
      serverVersion: 1,
    }).drafted).toBe(false)
  })

  it('blocks Save when the object moved, and still allows Discard', () => {
    stageObjectCell({
      objectId: 'obj-1',
      attribute: 'name',
      columnId: 'name',
      baseVersion: 3,
      originalText: 'A',
      proposedText: 'B',
      value: 'B',
    })
    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 4 },
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
    })
    expect(plan[0]).toMatchObject({ kind: 'blocked' })
    expect(reviewCapabilities({
      principal: 'human',
      viaAgent: false,
      open: true,
      stale: true,
      conflict: false,
      validationErrors: [],
      roleCanWrite: true,
    }).canDiscard).toBe(true)
    expect(editBaseVersion('obj-1', 4)).toBe(3)
  })

  it('does not let an agent save or discard', () => {
    const blocked = reviewCapabilities({
      principal: 'agent',
      viaAgent: false,
      open: true,
      stale: false,
      conflict: false,
      validationErrors: [],
      roleCanWrite: true,
    })
    expect(blocked.canSave).toBe(false)
    expect(blocked.canDiscard).toBe(false)
  })
})

describe('version-correct proposal cells', () => {
  it('uses the base snapshot, not the latest object, and names create, update and delete', () => {
    const cells = reviewCells({
      objectId: 'obj-1',
      patch: { values: { name: { en: 'Agent draft' } } },
      baseValues: { name: { en: 'Old name' } },
      liveValues: { name: { en: 'Someone else' } },
    })
    expect(cells).toEqual([
      expect.objectContaining({
        id: 'name@en',
        op: 'update',
        originalText: 'Old name',
        proposedText: 'Agent draft',
        originalKnown: true,
      }),
    ])
    expect(reviewCells({
      patch: { values: { name: { en: 'New' } } },
      baseValues: null,
    })[0]?.op).toBe('create')
    expect(reviewCells({
      objectId: 'obj-1',
      patch: { op: 'delete' },
      baseValues: { name: { en: 'Old' } },
    })[0]?.op).toBe('delete')
  })
})

describe('model step identity', () => {
  it('keeps a step key when another step is removed or the list is reordered', () => {
    const weight = { op: 'add_attribute', attribute: 'weight' }
    const name = { op: 'add_attribute', attribute: 'name' }
    const ordered = modelStepKeys([weight, name])
    const reordered = modelStepKeys([name, weight])
    expect(reordered).toEqual([ordered[1], ordered[0]])
    expect(modelStepKeys([name])).toEqual([ordered[1]])
  })
})
