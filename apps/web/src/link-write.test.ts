import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { setAiMode } from './ai-mode'
import { publishProposal } from './proposal-bus'
import { submitLink, submitLinks } from './link-write'

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
    await expect(submitLinks([body, second])).resolves.toEqual({ outcome: 'proposed', created: [] })
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
    await expect(submitLinks([body, second])).resolves.toEqual({ outcome: 'proposed', created: [] })
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
      created: [{ body, id: 'link-1' }],
      failed: { body: second, message: 'link type replaces allows one link to each target' },
    })
    expect(post).toHaveBeenCalledTimes(2)
  })
})
