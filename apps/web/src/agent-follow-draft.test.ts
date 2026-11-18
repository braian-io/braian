import { describe, expect, it } from 'vitest'
import { readAgentFollowDraft, writeAgentFollowDraft } from './agent-follow-draft'

describe('agent follow-up drafts', () => {
  it('stores and clears text per run id', () => {
    writeAgentFollowDraft('run-1', 'hello')
    expect(readAgentFollowDraft('run-1')).toBe('hello')
    writeAgentFollowDraft('run-1', '')
    expect(readAgentFollowDraft('run-1')).toBe('')
  })
})