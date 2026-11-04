import { describe, expect, it } from 'vitest'
import { agentRunPrompt, agentRunsForWorkspace, agentTabTitle, cleanAgentError, type AgentRunSummary } from './agent-runs'

function run(patch: Partial<AgentRunSummary>): AgentRunSummary {
  return {
    id: 'run',
    title: 'prompt',
    status: 'done',
    mode: 'foreground',
    session_kind: 'own',
    hidden: false,
    tab_open: true,
    workspace_id: 'here',
    created_at: '2026-11-04T18:00:00Z',
    updated_at: '2026-11-04T18:00:00Z',
    ...patch,
  }
}

describe('agent run presentation', () => {
  it('shortens a long prompt and keeps a short one', () => {
    expect(agentTabTitle('propose a new name')).toBe('propose a new name')
    const long = 'please rewrite the selected product description so it fits the catalog voice and stays specific'
    const title = agentTabTitle(long)
    expect(title.endsWith('…')).toBe(true)
    expect(title.length).toBeLessThan(long.length)
    expect(long.startsWith(title.slice(0, -1))).toBe(true)
  })

  it('cleans a failed run error', () => {
    expect(cleanAgentError('openai error: the model request failed (status 500)')).toBe(
      'The model request failed. Try again, or check the AI settings.',
    )
  })

  it('keeps another workspace visible instead of dropping the tab', () => {
    const split = agentRunsForWorkspace(
      [
        run({ id: 'here', workspace_id: 'ws-a' }),
        run({ id: 'there', title: 'agent in another workspace', workspace_id: 'ws-b' }),
        run({ id: 'closed', tab_open: false, workspace_id: 'ws-b' }),
      ],
      'ws-a',
    )
    expect(split.here.map((item) => item.id)).toEqual(['here'])
    expect(split.elsewhere.map((item) => item.id)).toEqual(['there'])
  })

  it('uses the first user message as the full prompt', () => {
    expect(agentRunPrompt({
      ...run({ title: 'short' }),
      messages: [{ id: 'm', kind: 'user', body: { text: 'the full prompt' }, created_at: '' }],
    })).toBe('the full prompt')
  })
})
