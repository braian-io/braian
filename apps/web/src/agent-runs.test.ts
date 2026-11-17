import { describe, expect, it } from 'vitest'
import { agentDisplayTitleFallback, agentDockTabSessionLabel, agentNoticeText, agentNotices, agentPaletteRows, agentRunPrompt, agentRunsForWorkspace, agentSessionAccessibleDescription, agentSessionHeaderTitle, agentStatusLabel, agentTabTitle, agentViewTabPrompt, agentsPaletteRoot, backgroundNotices, backgroundWorkingCount, cleanAgentError, mergeRunSummary, sortAgentRuns, type AgentRunSummary } from './agent-runs'

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
  it('uses a fixed Agent tab title regardless of prompt length', () => {
    expect(agentTabTitle('propose a new name')).toBe('Agent')
    const long = 'please rewrite the selected product description so it fits the catalog voice and stays specific'
    expect(agentTabTitle(long)).toBe('Agent')
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
    expect(agentNoticeText({ ...done, proposal_count: 2 })).toBe('rename the product finished · 2 proposals')
    expect(agentNotices([waiting]).map((notice) => notice.actionLabel)).toEqual(['Answer'])
    expect(agentNotices([done]).map((notice) => notice.actionLabel)).toEqual(['Review results'])
    expect(agentNotices([
      run({ id: 'a', title: 'alpha', status: 'done', mode: 'background' }),
      run({ id: 'b', title: 'beta', status: 'done', mode: 'background' }),
    ]).map((notice) => notice.actionLabel)).toEqual(['Review results'])
    expect(agentNotices([
      run({ id: 'a', title: 'alpha', status: 'done', mode: 'background' }),
      run({ id: 'b', title: 'beta', status: 'done', mode: 'background' }),
    ]).map((notice) => notice.text)).toEqual(['2 agents finished'])
    const foreground = run({ id: 'b', mode: 'foreground', status: 'waiting' })
    const sentBack = run({ ...foreground, mode: 'background' })
    expect(backgroundNotices([foreground], [sentBack]).map((item) => item.id)).toEqual(['b'])
    const sentBackAgain = run({ ...sentBack, mode: 'background', updated_at: '2026-11-05T12:10:00Z' })
    const broughtFront = run({ ...sentBackAgain, mode: 'foreground', updated_at: '2026-11-05T12:11:00Z' })
    const notices = agentNotices(backgroundNotices([broughtFront], [sentBackAgain]))
    expect(notices.map((notice) => notice.actionLabel)).toEqual(['Answer'])
    expect(notices[0]?.id).not.toBe(`agent-notice-b-waiting-${foreground.updated_at}`)
    const list = [foreground, working]
    expect(mergeRunSummary(list, foreground)).toBe(list)
    const merged = mergeRunSummary(list, sentBack)
    expect(merged?.[0]?.mode).toBe('background')
    expect(merged?.[1]).toBe(working)
    // A poll that never sampled foreground cannot see the trip back to background.
    expect(backgroundNotices([sentBackAgain], [sentBackAgain])).toEqual([])
    const seen = mergeRunSummary([sentBackAgain], broughtFront)
    const sentBackAfter = run({ ...broughtFront, mode: 'background', updated_at: '2026-11-05T12:12:00Z' })
    expect(backgroundNotices(seen ?? [], [sentBackAfter]).map((item) => item.id)).toEqual(['b'])
  })

  it('sorts waiting ahead of working and done', () => {
    const rows = sortAgentRuns([
      run({ id: 'done', status: 'done', updated_at: '2026-11-05T12:00:00Z' }),
      run({ id: 'working', status: 'working', updated_at: '2026-11-05T12:05:00Z' }),
      run({ id: 'waiting-old', status: 'waiting', updated_at: '2026-11-05T11:00:00Z' }),
      run({ id: 'waiting-new', status: 'waiting', updated_at: '2026-11-05T12:04:00Z' }),
    ])
    expect(rows.map((item) => item.id)).toEqual(['waiting-new', 'waiting-old', 'working', 'done'])
    expect(agentStatusLabel('paused')).toBe('Paused')
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
      run({
        id: 'run-1',
        title: 'ask me before you continue',
        status: 'waiting',
        question: 'Which value should I use? I will not guess.',
      }),
    ])
    expect(rows[0]?.id).toBe('agent-run:run-1')
    expect(rows[0]?.title).toBe('ask me before you continue')
    expect(rows[0]?.subtitle).toBe('Which value should I use? I will not guess.')
    expect(rows[0]?.chips?.map((chip) => chip.text)).toEqual(['Waiting'])
  })

  it('uses the first user message as the full prompt', () => {
    expect(agentRunPrompt({
      ...run({ title: 'short' }),
      messages: [{ id: 'm', kind: 'user', body: { text: 'the full prompt' }, created_at: '' }],
    })).toBe('the full prompt')
  })

  it('omits the dock tab prompt for legacy agent views', () => {
    expect(agentViewTabPrompt({ type: 'agent', state: {} })).toBeUndefined()
    expect(agentViewTabPrompt({ type: 'agent', state: { prompt: '  ' } })).toBeUndefined()
    expect(agentViewTabPrompt({ type: 'object_table' })).toBeUndefined()
    expect(agentViewTabPrompt({ type: 'agent', state: { prompt: 'rename Cheddar' } })).toBe('rename Cheddar')
  })

  it('truncates long prompts for the header fallback', () => {
    const long = `${'x'.repeat(100)} tail`
    expect(agentDisplayTitleFallback(long)).toMatch(/…$/)
    expect(agentDisplayTitleFallback(long).length).toBeLessThanOrEqual(81)
  })

  it('uses the short title in the header but keeps the full prompt accessible', () => {
    const run = {
      title: 'Rename Cheddar slice',
      messages: [{ id: 'm', kind: 'user', body: { text: 'please rename Cheddar to Blue and keep the key' }, created_at: '' }],
    }
    expect(agentSessionHeaderTitle(run)).toBe('Rename Cheddar slice')
    expect(agentSessionAccessibleDescription(run)).toBe('please rename Cheddar to Blue and keep the key')
  })

  it('prefers the run title for dock tooltips', () => {
    expect(agentDockTabSessionLabel(
      { type: 'agent', state: { run_id: 'r1' } },
      [run({ id: 'r1', title: 'Winter assortment plan' })],
    )).toBe('Winter assortment plan')
  })
})
