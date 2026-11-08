import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Json } from './api'
import {
  objectDraftCells,
  resetObjectDrafts,
  stageObjectCell,
} from './object-draft'
import {
  draftDiscardPlan,
  draftSavePlan,
  runDraftDiscard,
  runDraftSave,
} from './object-draft-save'
import type { IndexedProposalCell, ProposalMembership } from './review-cells'

const mock = vi.hoisted(() => {
  const methods = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
  return { methods }
})

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, api: mock.methods }
})

vi.mock('./object-write', () => ({ applyObjectWrite: vi.fn(async () => undefined) }))
vi.mock('./agent-runs', () => ({ proposeInAgentSession: vi.fn(async () => ({})) }))

function stage(objectId: string, text: string, baseVersion = 1) {
  stageObjectCell({
    objectId,
    attribute: 'name',
    columnId: 'name@en',
    language: 'en',
    baseVersion,
    originalText: 'Old',
    proposedText: text,
    value: text,
  })
}

function humanPlan(objectIds: string[], versions: Record<string, number>) {
  return draftSavePlan({
    objectIds,
    serverVersions: versions,
    principal: 'human',
    fileAsProposal: false,
    roleCanWrite: true,
  })
}

function proposalCell(proposalId: string, objectId: string, rowId: string): IndexedProposalCell {
  return {
    id: 'name@en',
    attribute: 'name',
    language: 'en',
    op: 'update',
    originalKnown: true,
    originalText: 'Old',
    proposedText: 'New',
    proposed: 'New',
    proposalId,
    rowId,
    objectId,
    stale: false,
    staleReason: '',
    conflict: false,
  }
}

function member(proposalId: string, objectIds: string[], unmapped = false): ProposalMembership {
  return { proposalId, objectIds, unmapped }
}

beforeEach(() => {
  resetObjectDrafts()
  for (const method of Object.values(mock.methods)) method.mockReset()
})

describe('save scope', () => {
  it('writes exactly the reviewed object ids', () => {
    stage('obj-1', 'One')
    stage('obj-2', 'Two')
    const plan = humanPlan(['obj-1'], { 'obj-1': 1, 'obj-2': 1 })
    expect(plan).toEqual([expect.objectContaining({ kind: 'patch', objectId: 'obj-1' })])
  })

  it('does not accept proposals that belong to another object', () => {
    const plan = draftSavePlan({
      objectIds: [],
      serverVersions: {},
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      scope: ['obj-1'],
      proposals: [proposalCell('p-1', 'obj-1', 'r1'), proposalCell('p-2', 'obj-2', 'r2')],
    })
    expect(plan).toEqual([{ kind: 'accept', proposalId: 'p-1', rowIds: ['r1'] }])
  })

  it('saves a local draft and accepts a proposal on another reviewed row', () => {
    stage('obj-1', 'One')
    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 1 },
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      scope: ['obj-1', 'obj-2'],
      proposals: [proposalCell('p-2', 'obj-2', 'r2')],
    })
    expect(plan).toEqual([
      expect.objectContaining({ kind: 'patch', objectId: 'obj-1' }),
      { kind: 'accept', proposalId: 'p-2', rowIds: ['r2'] },
    ])
  })

  it('lets a local draft win on its object instead of blocking or accepting its proposal', () => {
    stage('obj-1', 'One')
    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 1 },
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      scope: ['obj-1'],
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
    })
    expect(plan).toEqual([expect.objectContaining({ kind: 'patch', objectId: 'obj-1' })])
  })

  it('saves a local draft even when another reviewed proposal is stale, and does not accept it', () => {
    stage('obj-1', 'One')
    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 1 },
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      scope: ['obj-1', 'obj-2'],
      proposals: [{ ...proposalCell('p-2', 'obj-2', 'r2'), stale: true, staleReason: 'changed' }],
    })
    expect(plan).toEqual([expect.objectContaining({ kind: 'patch', objectId: 'obj-1' })])
  })

  it('still blocks a Save that has only a stale proposal', () => {
    const plan = draftSavePlan({
      objectIds: [],
      serverVersions: {},
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      scope: ['obj-2'],
      proposals: [{ ...proposalCell('p-2', 'obj-2', 'r2'), stale: true, staleReason: 'changed' }],
    })
    expect(plan[0]).toMatchObject({ kind: 'blocked' })
  })
})

describe('partial and transport failures', () => {
  it('clears the saved object and preserves the failed one', async () => {
    stage('obj-1', 'One')
    stage('obj-2', 'Two')
    mock.methods.patch.mockImplementation((_path: string, init: { params: { path: { id: string } } }) => {
      if (init.params.path.id === 'obj-1') return Promise.resolve({ id: 'obj-1', version: 2, values: {} })
      return Promise.reject(new Error('network down'))
    })
    const client = new QueryClient()
    const reason = await runDraftSave(humanPlan(['obj-1', 'obj-2'], { 'obj-1': 1, 'obj-2': 1 }), client)
    expect(reason).toContain('network down')
    expect(objectDraftCells('obj-1')).toHaveLength(0)
    expect(objectDraftCells('obj-2')[0]?.proposedText).toBe('Two')
  })

  it('keeps the draft when the server does not acknowledge a newer revision', async () => {
    stage('obj-1', 'One')
    mock.methods.patch.mockResolvedValue({ id: 'obj-1', version: 1, values: {} })
    const reason = await runDraftSave(humanPlan(['obj-1'], { 'obj-1': 1 }), new QueryClient())
    expect(reason).toContain('newer revision')
    expect(objectDraftCells('obj-1')[0]?.proposedText).toBe('One')
  })

  it('keeps an edit typed while the request is in flight', async () => {
    let resolve: ((value: Json) => void) | undefined
    mock.methods.patch.mockImplementation(() => new Promise((done) => { resolve = done as (value: Json) => void }))
    stage('obj-1', 'First')
    const running = runDraftSave(humanPlan(['obj-1'], { 'obj-1': 1 }), new QueryClient())
    await new Promise((done) => setTimeout(done, 0))
    stage('obj-1', 'Second')
    resolve?.({ id: 'obj-1', version: 2, values: {} })
    expect(await running).toBe('')
    expect(objectDraftCells('obj-1')).toHaveLength(1)
    expect(objectDraftCells('obj-1')[0]?.proposedText).toBe('Second')
  })

  it('reports a failed propose and keeps the local draft', async () => {
    const runs = await import('./agent-runs')
    vi.mocked(runs.proposeInAgentSession).mockRejectedValueOnce(new Error('proposal failed'))
    stage('obj-1', 'One')
    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 1 },
      principal: 'human',
      fileAsProposal: true,
      roleCanWrite: true,
      meta: { 'obj-1': { key: 'ART-1', type: 'article' } },
    })
    const reason = await runDraftSave(plan, new QueryClient(), 'run-1')
    expect(reason).toContain('proposal failed')
    expect(objectDraftCells('obj-1')[0]?.proposedText).toBe('One')
  })

  it('refreshes the proposal and agent caches after filing a proposal', async () => {
    stage('obj-1', 'One')
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const plan = draftSavePlan({
      objectIds: ['obj-1'],
      serverVersions: { 'obj-1': 1 },
      principal: 'human',
      fileAsProposal: true,
      roleCanWrite: true,
      meta: { 'obj-1': { key: 'ART-1', type: 'article' } },
    })
    expect(await runDraftSave(plan, client, 'run-1')).toBe('')
    expect(objectDraftCells('obj-1')).toHaveLength(0)
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['proposals'] }))
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['agent-run', 'run-1'] }))
  })
})

describe('proposal accept results', () => {
  it('reports a failed row from a partial accept and refreshes the review caches', async () => {
    mock.methods.post.mockResolvedValue({
      accepted: [{ id: 'r1' }],
      failed: [{ id: 'r2', code: 'conflict', detail: 'row conflict' }],
    })
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const plan = draftSavePlan({
      objectIds: [],
      serverVersions: {},
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      proposals: [proposalCell('p-1', 'obj-1', 'r1'), proposalCell('p-1', 'obj-1', 'r2')],
    })
    const reason = await runDraftSave(plan, client)
    expect(reason).toContain('row conflict')
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['proposals'] }))
  })

  it('refreshes the review and reports a transport failure', async () => {
    mock.methods.post.mockRejectedValue(new Error('offline'))
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const plan = draftSavePlan({
      objectIds: [],
      serverVersions: {},
      principal: 'human',
      fileAsProposal: false,
      roleCanWrite: true,
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
    })
    const reason = await runDraftSave(plan, client)
    expect(reason).toContain('offline')
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['proposals'] }))
  })
})

describe('discard scope', () => {
  it('does not discard a proposal that touches another object', () => {
    stage('obj-1', 'One')
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [
        proposalCell('p-1', 'obj-1', 'r1'),
        proposalCell('p-2', 'obj-2', 'r2'),
        proposalCell('p-3', 'obj-1', 'r3'),
        proposalCell('p-3', 'obj-2', 'r4'),
      ],
      membership: [
        member('p-1', ['obj-1']),
        member('p-2', ['obj-2']),
        member('p-3', ['obj-1', 'obj-2']),
      ],
    })
    expect(plan.clear).toEqual(['obj-1'])
    expect(plan.discard).toEqual(['p-1'])
  })

  it('only posts the in-scope proposal and leaves another object draft alone', async () => {
    stage('obj-1', 'One')
    stage('obj-2', 'Two')
    mock.methods.post.mockResolvedValue({})
    const reason = await runDraftDiscard({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [proposalCell('p-1', 'obj-1', 'r1'), proposalCell('p-2', 'obj-2', 'r2')],
      membership: [member('p-1', ['obj-1']), member('p-2', ['obj-2'])],
    })
    expect(reason).toBe('')
    expect(mock.methods.post).toHaveBeenCalledTimes(1)
    expect(mock.methods.post).toHaveBeenCalledWith('/v1/proposals/{id}/discard', { params: { path: { id: 'p-1' } } })
    expect(objectDraftCells('obj-1')).toHaveLength(0)
    expect(objectDraftCells('obj-2')[0]?.proposedText).toBe('Two')
  })

  it('keeps a proposal whose complete membership has a hidden object, even when only the visible cell is supplied', () => {
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
      membership: [member('p-1', ['obj-1', 'obj-2'])],
    })
    expect(plan.discard).toEqual([])
  })

  it('keeps a proposal with a create row that has no object cell', () => {
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
      membership: [member('p-1', ['obj-1'], true)],
    })
    expect(plan.discard).toEqual([])
  })

  it('keeps a proposal with a delete row', () => {
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
      membership: [member('p-1', ['obj-1'], true)],
    })
    expect(plan.discard).toEqual([])
  })

  it('keeps a proposal with a model row', () => {
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
      membership: [member('p-1', ['obj-1'], true)],
    })
    expect(plan.discard).toEqual([])
  })

  it('never derives a whole-proposal discard from partial cells when complete membership is missing', () => {
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [proposalCell('p-1', 'obj-1', 'r1')],
    })
    expect(plan.discard).toEqual([])
  })

  it('does not discard a proposal that has no reviewed cell in this scope', () => {
    const plan = draftDiscardPlan({
      objectIds: ['obj-1'],
      principal: 'human',
      viaAgent: false,
      proposals: [],
      membership: [member('p-1', ['obj-1'])],
    })
    expect(plan.discard).toEqual([])
  })
})
