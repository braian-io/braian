import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { setAiMode } from './ai-mode'
import { publishProposal } from './proposal-bus'
import { submitLink, submitLinks, undoCreatedLinks } from './link-write'
import { ApiError } from './api'

vi.mock('./proposal-bus', () => ({ publishProposal: vi.fn() }))

const body = { type: 'replaces', from_id: 'from-1', to_id: 'to-1', values: { note: 'aged' } }

afterEach(() => {
  setAiMode(false)
  vi.restoreAllMocks()
})

describe('submitLink', () => {
  it('saves the link for a person', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'link-1' } as never)
    await expect(submitLink(body)).resolves.toBe('created')
    expect(post).toHaveBeenCalledWith('/v1/links', { body })
    expect(publishProposal).not.toHaveBeenCalled()
  })

  it('opens Review when AI mode files a proposal', async () => {
    setAiMode(true)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'proposal-9' } as never)
    await expect(submitLink(body)).resolves.toBe('proposed')
    expect(post).toHaveBeenCalledWith('/v1/proposals', {
      body: {
        title: 'Link proposal',
        rows: [{ type_key: 'replaces', patch: { link: body } }],
      },
    })
    expect(publishProposal).toHaveBeenCalledWith('proposal-9')
  })

  it('files every dragged link in one proposal', async () => {
    setAiMode(true)
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'proposal-3' } as never)
    const second = { ...body, to_id: 'to-2' }
    await expect(submitLinks([body, second])).resolves.toEqual({ outcome: 'proposed', created: [], filed: 2 })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith('/v1/proposals', {
      body: {
        title: 'Link proposal',
        rows: [
          { type_key: 'replaces', patch: { link: body } },
          { type_key: 'replaces', patch: { link: second } },
        ],
      },
    })
    expect(publishProposal).toHaveBeenCalledTimes(1)
  })

  it('opens Review when the API answers with a proposal', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ proposal_id: 'proposal-2', needs_approval: true } as never)
    await expect(submitLink(body)).resolves.toBe('proposed')
    expect(publishProposal).toHaveBeenCalledWith('proposal-2')
  })

  it('files every agent link in one proposal instead of stopping after the first', async () => {
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ proposal_id: 'proposal-1', needs_approval: true } as never)
      .mockResolvedValueOnce({ id: 'proposal-all' } as never)
    const second = { ...body, to_id: 'to-2' }
    await expect(submitLinks([body, second])).resolves.toEqual({ outcome: 'proposed', created: [], filed: 2 })
    expect(post).toHaveBeenCalledTimes(2)
    expect(post).toHaveBeenLastCalledWith('/v1/proposals', {
      body: {
        title: 'Link proposal',
        rows: [
          { type_key: 'replaces', patch: { link: body } },
          { type_key: 'replaces', patch: { link: second } },
        ],
      },
    })
    expect(publishProposal).toHaveBeenCalledTimes(1)
    expect(publishProposal).toHaveBeenCalledWith('proposal-all')
  })

  it('reports a partial save and keeps the links that were stored', async () => {
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ id: 'link-1' } as never)
      .mockRejectedValueOnce(new Error('link type replaces allows one link to each target'))
    const second = { ...body, to_id: 'to-2' }
    await expect(submitLinks([body, second])).resolves.toEqual({
      outcome: 'partial',
      created: [{ body, id: 'link-1', version: 0, label: '' }],
      failed: { body: second, message: 'link type replaces allows one link to each target' },
    })
    expect(post).toHaveBeenCalledTimes(2)
  })

  it('files only the links that were not saved when approval starts halfway', async () => {
    const post = vi.spyOn(api, 'post')
      .mockResolvedValueOnce({ id: 'link-1', version: 4 } as never)
      .mockResolvedValueOnce({ proposal_id: 'proposal-1', needs_approval: true } as never)
      .mockResolvedValueOnce({ id: 'proposal-rest' } as never)
    const second = { ...body, to_id: 'to-2' }
    const third = { ...body, to_id: 'to-3' }
    await expect(submitLinks([body, second, third])).resolves.toEqual({
      outcome: 'proposed',
      created: [{ body, id: 'link-1', version: 4, label: '' }],
      filed: 2,
    })
    expect(post).toHaveBeenLastCalledWith('/v1/proposals', {
      body: {
        title: 'Link proposal',
        rows: [
          { type_key: 'replaces', patch: { link: second } },
          { type_key: 'replaces', patch: { link: third } },
        ],
      },
    })
    expect(publishProposal).toHaveBeenCalledTimes(1)
    expect(publishProposal).toHaveBeenCalledWith('proposal-rest')
  })
})

describe('undoCreatedLinks', () => {
  const saved = { ...body, to_id: 'to-1' }

  it('keeps a link that changed and still undoes the one that is already gone', async () => {
    const del = vi.spyOn(api, 'delete')
      .mockRejectedValueOnce(new ApiError(404, 'missing', null))
      .mockRejectedValueOnce(new ApiError(409, 'conflict', null))
      .mockResolvedValueOnce(undefined as never)
    const gone = { body: saved, id: 'gone', version: 1, label: 'ART-GONE' }
    const changed = { body: { ...saved, to_id: 'to-2' }, id: 'changed', version: 2, label: 'ART-X' }
    const fresh = { body: { ...saved, to_id: 'to-3' }, id: 'fresh', version: 3, label: 'ART-FRESH' }
    await expect(undoCreatedLinks([gone, changed, fresh])).resolves.toEqual({
      undone: [gone, fresh],
      kept: [changed],
      failed: [],
    })
    expect(del).toHaveBeenNthCalledWith(2, '/v1/links/{id}', {
      params: { path: { id: 'changed' }, header: { 'If-Match': 2 } },
    })
    expect(del).toHaveBeenCalledTimes(3)
  })

  it('keeps going when one delete fails for another reason', async () => {
    vi.spyOn(api, 'delete')
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error('offline'))
    const first = { body: saved, id: 'ok', version: 1, label: 'ART-OK' }
    const second = { body: saved, id: 'bad', version: 1, label: 'ART-BAD' }
    const result = await undoCreatedLinks([first, second])
    expect(result.undone).toEqual([first])
    expect(result.kept).toEqual([])
    expect(result.failed.map((item) => item.link.id)).toEqual(['bad'])
  })
})
