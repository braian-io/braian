import { beforeEach, describe, expect, it } from 'vitest'
import {
  discardObjectDraft,
  draftBaseVersion,
  draftCellKey,
  draftEditorSeed,
  draftValues,
  editBaseVersion,
  noteObjectDraftSaved,
  objectDraftCells,
  objectDraftSnapshot,
  overlayValues,
  paintObjectCell,
  resetObjectDrafts,
  reviewCapabilities,
  stageObjectCell,
} from './object-draft'
import { draftSavePlan } from './object-draft-save'
import { modelStepKeys, proposalMemberships, reviewCells, unmappedProposals } from './review-cells'

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

  it('does not let an older read replace a fresher read after Save', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 3, originalText: 'Old', proposedText: 'New', value: 'New' })
    noteObjectDraftSaved('obj-1', 4)
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name@en',
      attribute: 'name',
      language: 'en',
      serverText: 'New',
      serverVersion: 5,
    })).toEqual({ text: 'New', drafted: false, held: false })
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name@en',
      attribute: 'name',
      language: 'en',
      serverText: 'Old',
      serverVersion: 3,
    })).toEqual({ text: 'New', drafted: false, held: true })
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

describe('language-aware shared cells', () => {
  it('keys table and Detail by object, attribute and language and merges without losing a language', () => {
    stageObjectCell({
      objectId: 'obj-1',
      attribute: 'name',
      columnId: 'name@en',
      language: 'en',
      baseVersion: 2,
      originalText: 'Apples',
      proposedText: 'Apples QA',
      value: 'Apples QA',
    })
    stageObjectCell({
      objectId: 'obj-1',
      attribute: 'name',
      columnId: 'name@sv',
      language: 'sv',
      baseVersion: 2,
      originalText: 'Apples sv',
      proposedText: 'Apples sv QA',
      value: 'Apples sv QA',
    })
    expect(objectDraftCells('obj-1').map(draftCellKey)).toEqual([
      'obj-1\nname\nen',
      'obj-1\nname\nsv',
    ])
    expect(draftValues('obj-1')).toEqual({ name: { en: 'Apples QA', sv: 'Apples sv QA' } })
    expect(overlayValues('obj-1', { name: { en: 'Apples', sv: 'Apples sv', de: 'Apples de' } }, 2)).toEqual({
      name: { en: 'Apples QA', sv: 'Apples sv QA', de: 'Apples de' },
    })
  })

  it('removing a language no-op leaves the other language pending', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'B', value: 'B' })
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@sv', language: 'sv', baseVersion: 1, originalText: 'X', proposedText: 'Y', value: 'Y' })
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'A', value: 'A' })
    expect(objectDraftCells('obj-1').map((cell) => cell.language)).toEqual(['sv'])
  })

  it('reopens the editor from the draft instead of a stale read', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 3, originalText: 'Old', proposedText: 'Draft', value: 'Draft' })
    expect(draftEditorSeed({
      objectId: 'obj-1',
      columnId: 'name@en',
      attribute: 'name',
      language: 'en',
      serverText: 'Old',
      serverVersion: 2,
    })).toEqual({ text: 'Draft', originalText: 'Old' })
    expect(draftEditorSeed({
      objectId: 'obj-1',
      columnId: 'name@en',
      attribute: 'name',
      language: 'en',
      serverText: 'Old',
      serverVersion: 3,
    })).toEqual({ text: 'Draft', originalText: 'Old' })
  })

  it('clears only the submitted snapshot and keeps an edit made during the await', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'B', value: 'B' })
    const submitted = objectDraftSnapshot(['obj-1'])
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'C', value: 'C' })
    noteObjectDraftSaved('obj-1', 2, submitted)
    expect(objectDraftCells('obj-1')).toHaveLength(1)
    expect(objectDraftCells('obj-1')[0]?.proposedText).toBe('C')
  })

  it('shares cell identity between a qualified Detail column and an unqualified table column', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'B', value: 'B' })
    const submitted = objectDraftSnapshot(['obj-1'])
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'B', value: 'B' })
    noteObjectDraftSaved('obj-1', 2, submitted)
    expect(objectDraftCells('obj-1')).toHaveLength(0)
  })

  it('rebases an edit made during the in-flight save so the next save is not stale', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'B', value: 'B' })
    const submitted = objectDraftSnapshot(['obj-1'])
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name', language: 'en', baseVersion: 1, originalText: 'A', proposedText: 'C', value: 'C' })
    noteObjectDraftSaved('obj-1', 2, submitted)
    expect(objectDraftCells('obj-1')[0]).toMatchObject({
      proposedText: 'C',
      originalText: 'B',
      baseVersion: 2,
    })
    expect(draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 2 },
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
    })[0]).toMatchObject({ kind: 'patch', version: 2 })
  })

  it('does not paint another saved language into a stale unqualified language column', () => {
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@en', language: 'en', baseVersion: 1, originalText: 'Apples', proposedText: 'Apples QA', value: 'Apples QA' })
    stageObjectCell({ objectId: 'obj-1', attribute: 'name', columnId: 'name@sv', language: 'sv', baseVersion: 1, originalText: 'Apples sv', proposedText: 'Apples sv QA', value: 'Apples sv QA' })
    noteObjectDraftSaved('obj-1', 2)
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name',
      attribute: 'name',
      language: 'en',
      serverText: 'Apples',
      serverVersion: 1,
    })).toEqual({ text: 'Apples QA', drafted: false, held: true })
    expect(paintObjectCell({
      objectId: 'obj-1',
      columnId: 'name@sv',
      attribute: 'name',
      language: 'sv',
      serverText: 'Apples sv',
      serverVersion: 1,
    })).toEqual({ text: 'Apples sv QA', drafted: false, held: true })
  })
})

describe('review paths for drafts without an ordinary cell', () => {
  it('keeps create, delete and model proposals visible in the review', () => {
    const found = unmappedProposals([
      { id: 'p-create', title: 'Create', status: 'open', rows: [{ id: 'r1', status: 'pending', type_key: 'article', patch: { values: { name: { en: 'New' } } } }] },
      { id: 'p-delete', title: 'Delete', status: 'open', rows: [{ id: 'r2', status: 'pending', type_key: 'article', object_id: 'obj-1', patch: { op: 'delete' } }] },
      { id: 'p-model', title: 'Model', status: 'open', rows: [{ id: 'r3', status: 'pending', type_key: 'model', patch: { op: 'add_attribute' } }] },
    ])
    expect(found).toEqual([
      { proposalId: 'p-create', title: 'Create', reason: 'create' },
      { proposalId: 'p-delete', title: 'Delete', reason: 'delete' },
      { proposalId: 'p-model', title: 'Model', reason: 'model' },
    ])
  })
})

describe('complete proposal membership for discard', () => {
  it('keeps every pending object, including objects outside the visible view', () => {
    const found = proposalMemberships([
      {
        id: 'p-visible-hidden',
        status: 'open',
        rows: [
          { id: 'r1', status: 'pending', type_key: 'article', object_id: 'obj-1', patch: { values: { name: { en: 'New' } } } },
          { id: 'r2', status: 'pending', type_key: 'article', object_id: 'obj-2', patch: { values: { name: { en: 'Hidden' } } } },
          { id: 'r3', status: 'rejected', type_key: 'article', object_id: 'obj-3', patch: { values: { name: { en: 'Old' } } } },
        ],
      },
    ])
    expect(found.get('p-visible-hidden')).toEqual({
      proposalId: 'p-visible-hidden',
      objectIds: ['obj-1', 'obj-2'],
      unmapped: false,
    })
  })

  it('flags create, delete, model and assortment rows as unmapped', () => {
    const found = proposalMemberships([
      { id: 'p-create', status: 'open', rows: [{ id: 'r1', status: 'pending', type_key: 'article', patch: { values: { name: { en: 'New' } } } }] },
      { id: 'p-delete', status: 'open', rows: [{ id: 'r2', status: 'pending', type_key: 'article', object_id: 'obj-1', patch: { op: 'delete' } }] },
      { id: 'p-model', status: 'open', rows: [{ id: 'r3', status: 'pending', type_key: 'model', patch: { op: 'add_attribute' } }] },
      { id: 'p-assortment', status: 'open', rows: [{ id: 'r4', status: 'pending', type_key: 'assortment', patch: { op: 'add' } }] },
    ])
    expect(found.get('p-create')?.unmapped).toBe(true)
    expect(found.get('p-delete')).toEqual({ proposalId: 'p-delete', objectIds: ['obj-1'], unmapped: true })
    expect(found.get('p-model')?.unmapped).toBe(true)
    expect(found.get('p-assortment')?.unmapped).toBe(true)
  })

  it('ignores import sessions, closed proposals and non-pending rows', () => {
    const found = proposalMemberships([
      { id: 'p-import', status: 'open', session_id: 's-1', rows: [{ id: 'r1', status: 'pending', type_key: 'article', object_id: 'obj-1', patch: {} }] },
      { id: 'p-closed', status: 'accepted', rows: [{ id: 'r2', status: 'pending', type_key: 'article', object_id: 'obj-2', patch: {} }] },
      { id: 'p-empty', status: 'open', rows: [] },
    ])
    expect(found.has('p-import')).toBe(false)
    expect(found.has('p-closed')).toBe(false)
    expect(found.get('p-empty')).toEqual({ proposalId: 'p-empty', objectIds: [], unmapped: false })
  })
})

describe('model step identity with duplicates and nested content', () => {
  it('suffixes identical steps and keeps keys when the list is reordered or shortened', () => {
    const nested = { op: 'add_group', group: { key: 'a', attributes: ['x'] } }
    const same = { op: 'add_group', group: { key: 'a', attributes: ['x'] } }
    const attribute = { op: 'add_attribute', attribute: 'weight' }
    const ordered = modelStepKeys([nested, same, attribute])
    expect(ordered[0]).not.toBe(ordered[1])
    expect(ordered[1]).toBe(`${ordered[0]}#2`)
    const reordered = modelStepKeys([attribute, same, nested])
    expect(reordered).toEqual([ordered[2], ordered[0], ordered[1]])
    const removed = modelStepKeys([attribute, nested])
    expect(removed).toEqual([ordered[2], ordered[0]])
  })
})
