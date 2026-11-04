import { describe, expect, it } from 'vitest'
import { agentNoticeText, agentPaletteRows, agentRunPrompt, agentRunsForWorkspace, agentStatusLabel, agentTabTitle, agentsPaletteRoot, backgroundNotices, backgroundWorkingCount, cleanAgentError, type AgentRunSummary } from './agent-runs'

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

  it('counts background agents that are still working', () => {
    const runs = [
      run({ id: 'a', mode: 'background', status: 'working' }),
      run({ id: 'b', mode: 'background', status: 'working' }),
      run({ id: 'c', mode: 'background', status: 'waiting' }),
      run({ id: 'd', mode: 'foreground', status: 'working' }),
    ]
    expect(backgroundWorkingCount(runs)).toBe(2)
  })

  it('notifies when a background run finishes or starts waiting', () => {
    const working = run({ id: 'a', title: 'rename the product', mode: 'background', status: 'working' })
    const waiting = run({ ...working, status: 'waiting' })
    const done = run({ ...working, status: 'done' })
    expect(backgroundNotices([working], [waiting]).map((item) => item.status)).toEqual(['waiting'])
    expect(backgroundNotices([working], [done]).map((item) => item.id)).toEqual(['a'])
    expect(backgroundNotices([done], [done])).toEqual([])
    expect(backgroundNotices([], [done]).map((item) => item.id)).toEqual(['a'])
    expect(agentNoticeText(waiting)).toBe('rename the product is waiting for you')
    expect(agentNoticeText(done)).toBe('rename the product finished')
    const foreground = run({ id: 'b', mode: 'foreground', status: 'waiting' })
    const sentBack = run({ ...foreground, mode: 'background' })
    expect(backgroundNotices([foreground], [sentBack]).map((item) => item.id)).toEqual(['b'])
  })

  it('labels waiting as Waiting for you in the tab and Waiting in the table', () => {
    expect(agentStatusLabel('waiting', 'tab')).toBe('Waiting for you')
    expect(agentStatusLabel('waiting', 'table')).toBe('Waiting')
    expect(agentStatusLabel('working')).toBe('Working')
    expect(agentStatusLabel('done')).toBe('Done')
    expect(agentStatusLabel('failed')).toBe('Failed')
  })

  it('lists agents for the palette drill-in', () => {
    expect(agentsPaletteRoot().argument).toEqual({ name: 'id', type: 'agent' })
    expect(agentsPaletteRoot().title.endsWith('›')).toBe(true)
    const rows = agentPaletteRows([
      run({ id: 'run-1', title: 'ask me before you continue', status: 'waiting' }),
    ])
    expect(rows[0]?.id).toBe('agent-run:run-1')
    expect(rows[0]?.title).toBe('ask me before you continue')
    expect(rows[0]?.subtitle).toBe('Waiting')
  })

  it('uses the first user message as the full prompt', () => {
    expect(agentRunPrompt({
      ...run({ title: 'short' }),
      messages: [{ id: 'm', kind: 'user', body: { text: 'the full prompt' }, created_at: '' }],
    })).toBe('the full prompt')
  })
})
